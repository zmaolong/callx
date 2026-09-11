/**
 * Flow 执行器
 *
 * 负责 Flow 的序列执行：从 Start 沿唯一主链依序执行到 End。
 * 执行调度位于 Renderer 进程，通过现有 sendNetworkRequest 发起 HTTP 请求。
 *
 * 运行态不写回 Flow 文件，仅保留在 Redux flowRun slice 中。
 */
import { uuid } from 'utils/common';
import { resolveExecutionPath } from 'utils/flow/graph';
import { resolveInputMappings } from 'utils/flow/input-mapping';
import { selectBranch } from 'utils/flow/expressions';
import { findEnvironmentInCollection } from 'utils/collections';
import { sendNetworkRequest, cancelNetworkRequest } from 'utils/network/index';
import {
  initFlowRun,
  updateFlowNodeStatus,
  markNodesSkipped,
  setFlowRunStatus,
  cancelFlowRun as cancelFlowRunAction,
  NODE_STATUS,
  FLOW_STATUS
} from 'providers/ReduxStore/slices/flowRun';

/**
 * 执行 Flow。
 *
 * @param {Object} options
 * @param {string} options.flowUid Flow 的 uid
 * @param {string} options.collectionUid 集合 uid
 * @param {Object} options.flow Flow 对象（包含 nodes 和 edges）
 * @param {Object} options.collection 集合对象（cloneDeep 的副本）
 * @param {Object} options.collectionItems Flow 目录中的 item 映射 { [itemUid]: item }
 * @param {function} options.dispatch Redux dispatch
 * @param {function} options.getState Redux getState
 * @returns {Promise<Object>} 执行结果
 */
export async function executeFlow({
  flowUid,
  collectionUid,
  flow,
  collection,
  collectionItems,
  dispatch,
  getState
}) {
  const nodes = flow.nodes || [];
  const edges = flow.edges || [];

  // 1. 校验图，解析执行路径
  let executionPath;
  try {
    executionPath = resolveExecutionPath(nodes, edges);
  } catch (error) {
    return { success: false, error: `图校验失败: ${error.message}` };
  }

  // 2. 初始化运行态
  const cancelTokenUid = uuid();
  dispatch(initFlowRun({ flowUid, nodes, cancelTokenUid }));

  const flowRunState = getState().flowRun;
  const run = flowRunState.runs[flowUid];
  if (!run) {
    return { success: false, error: '无法初始化运行态' };
  }

  let flowContext = {};

  // 构建出边映射（source -> [edge]）
  const outgoingEdgeMap = new Map();
  for (const edge of edges) {
    if (!outgoingEdgeMap.has(edge.source)) {
      outgoingEdgeMap.set(edge.source, []);
    }
    outgoingEdgeMap.get(edge.source).push(edge);
  }

  // 已执行节点集合（防止环）
  const executed = new Set();

  try {
    // 3. 遍历执行路径（支持条件分支）
    let i = 0;
    while (i < executionPath.length) {
      const step = executionPath[i];
      const stepId = step.stepId;

      // 防止环
      if (executed.has(stepId)) {
        return { success: false, error: `检测到环：节点 ${stepId} 被重复执行` };
      }
      executed.add(stepId);

      // 检查取消
      const currentRun = getState().flowRun.runs[flowUid];
      if (currentRun?.cancelled) {
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.CANCELLED
        }));
        const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.CANCELLED }));
        return { success: false, cancelled: true };
      }

      // 查找节点
      const node = nodes.find((n) => n.id === stepId);
      if (!node) {
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          error: `节点 ${stepId} 不存在`
        }));
        const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
        return { success: false, error: `节点 ${stepId} 不存在` };
      }

      // 标记为 running
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId,
        status: NODE_STATUS.RUNNING
      }));

      // 查找对应的请求 item
      const item = collectionItems[node.requestUid];
      if (!item) {
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          error: `请求 ${node.requestUid} 不存在`
        }));
        const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
        return { success: false, error: `请求 ${node.requestUid} 不存在` };
      }

      // 4. 解析输入映射
      const inputs = node.inputs || [];
      const flowContextWithEdges = {
        _nodeResults: flowContext,
        _edges: edges
      };

      const { variables, errors: mappingErrors } = resolveInputMappings(
        inputs,
        flowContextWithEdges,
        stepId
      );

      if (mappingErrors.length > 0) {
        const errorMsg = mappingErrors.map((e) => `${e.variableName}: ${e.error}`).join('; ');
        const { handled, shouldStop } = await handleNodeError({
          flowUid,
          node,
          stepId,
          error: `输入映射失败: ${errorMsg}`,
          inputVariables: variables,
          executionPath,
          i,
          edges,
          nodes,
          collectionItems,
          flowContext,
          flowContextWithEdges,
          dispatch,
          getState
        });
        if (shouldStop) {
          return { success: false, error: errorMsg };
        }
        // continue 或 jump 后继续
        if (handled) {
          i += 1;
          continue;
        }
      }

      // 5. 构建 runtime variables 并执行请求
      const collectionCopy = JSON.parse(JSON.stringify(collection));
      const environment = findEnvironmentInCollection(collectionCopy, collectionCopy.activeEnvironmentUid);
      collectionCopy.runtimeVariables = {
        ...(collectionCopy.runtimeVariables || {}),
        ...variables
      };

      try {
        const startTime = Date.now();
        const response = await sendNetworkRequest(item, collectionCopy, environment, collectionCopy.runtimeVariables);
        const duration = Date.now() - startTime;

        if (response?.error) {
          // HTTP 失败——检查错误处理策略
          const { handled, shouldStop } = await handleNodeError({
            flowUid,
            node,
            stepId,
            error: response.error,
            body: response.data || null,
            httpStatus: response.status,
            duration,
            inputVariables: variables,
            executionPath,
            i,
            edges,
            nodes,
            collectionItems,
            flowContext,
            flowContextWithEdges,
            dispatch,
            getState
          });
          if (shouldStop) {
            return { success: false, error: response.error };
          }
          if (handled) {
            i += 1;
            continue;
          }
        }

        // 成功
        flowContext[stepId] = {
          body: response.data,
          status: response.status,
          duration
        };

        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.SUCCESS,
          body: response.data,
          httpStatus: response.status,
          duration,
          inputVariables: variables
        }));
      } catch (error) {
        // 检查是否取消
        if (error.message && error.message.includes('cancelled')) {
          dispatch(updateFlowNodeStatus({
            flowUid,
            stepId,
            status: NODE_STATUS.CANCELLED,
            inputVariables: variables
          }));
          const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
          if (remaining.length > 0) {
            dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
          }
          dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.CANCELLED }));
          return { success: false, cancelled: true };
        }

        // 网络错误——检查错误处理策略
        const { handled, shouldStop } = await handleNodeError({
          flowUid,
          node,
          stepId,
          error: error.message || '网络请求失败',
          inputVariables: variables,
          executionPath,
          i,
          edges,
          nodes,
          collectionItems,
          flowContext,
          flowContextWithEdges,
          dispatch,
          getState
        });
        if (shouldStop) {
          return { success: false, error: error.message };
        }
        if (handled) {
          i += 1;
          continue;
        }
      }

      // 6. 条件分支选择——根据 flowContext 评估出边条件
      const outgoingEdges = outgoingEdgeMap.get(stepId) || [];
      if (outgoingEdges.length > 0) {
        const selectedEdge = selectBranch(outgoingEdges, flowContext);
        if (selectedEdge) {
          if (selectedEdge.target === 'end') {
            // 到达 End，执行完成
            break;
          }
          // 跳转到目标节点
          const targetIndex = executionPath.findIndex((s) => s.stepId === selectedEdge.target);
          if (targetIndex !== -1) {
            i = targetIndex;
            continue;
          }
        }
        // 无可用分支，流程终止
        break;
      }

      i += 1;
    }

    // 7. 全部执行完成
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.SUCCESS }));
    return { success: true };
  } catch (error) {
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
    return { success: false, error: error.message };
  }
}

/**
 * 处理节点错误——根据错误处理策略决定流程走向。
 *
 * @returns {Promise<{ handled: boolean, shouldStop: boolean }>}
 */
async function handleNodeError({
  flowUid,
  node,
  stepId,
  error,
  body,
  httpStatus,
  duration,
  inputVariables,
  executionPath,
  i,
  edges,
  nodes,
  collectionItems,
  flowContext,
  flowContextWithEdges,
  dispatch,
  getState
}) {
  const errorHandler = node?.errorHandler;
  const strategy = errorHandler?.strategy || 'stop';

  switch (strategy) {
    case 'continue': {
      // 记录错误，继续下一步
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId,
        status: NODE_STATUS.FAILED,
        body: body || null,
        httpStatus: httpStatus || null,
        duration: duration || null,
        error,
        inputVariables: inputVariables || null
      }));
      // 在 flowContext 中记录错误结果
      flowContext[stepId] = {
        body: body || null,
        status: httpStatus || 0,
        duration: duration || 0,
        error
      };
      return { handled: true, shouldStop: false };
    }

    case 'jump': {
      const targetId = errorHandler?.jumpToNodeId;
      if (targetId) {
        // 标记当前节点为失败
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          body: body || null,
          httpStatus: httpStatus || null,
          duration: duration || null,
          error,
          inputVariables: inputVariables || null
        }));

        // 查找目标节点是否存在
        const targetNode = nodes.find((n) => n.id === targetId);
        if (!targetNode) {
          // 目标节点不存在，终止
          const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
          if (remaining.length > 0) {
            dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
          }
          dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
          return { handled: false, shouldStop: true };
        }

        // 将当前节点之后、目标节点之前的所有节点标记为 skipped
        // 注意：jump 可能向前或向后跳转，不能简单标记
        // 这里只标记从当前到目标之间路径上的节点
        const startIdx = i + 1;
        const targetIdx = executionPath.findIndex((s) => s.stepId === targetId);
        if (targetIdx > startIdx) {
          const skipped = executionPath.slice(startIdx, targetIdx).map((s) => s.stepId);
          if (skipped.length > 0) {
            dispatch(markNodesSkipped({ flowUid, stepIds: skipped }));
          }
        }

        return { handled: true, shouldStop: false };
      }
      // 无跳转目标，回退到 stop
      break;
    }

    case 'stop':
    default: {
      // 默认行为：标记失败，后续 skipped
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId,
        status: NODE_STATUS.FAILED,
        body: body || null,
        httpStatus: httpStatus || null,
        duration: duration || null,
        error,
        inputVariables: inputVariables || null
      }));
      const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
      if (remaining.length > 0) {
        dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
      }
      dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
      return { handled: false, shouldStop: true };
    }
  }

  // fallback: stop
  dispatch(updateFlowNodeStatus({
    flowUid,
    stepId,
    status: NODE_STATUS.FAILED,
    body: body || null,
    httpStatus: httpStatus || null,
    duration: duration || null,
    error,
    inputVariables: inputVariables || null
  }));
  const remaining = executionPath.slice(i + 1).map((s) => s.stepId);
  if (remaining.length > 0) {
    dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
  }
  dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
  return { handled: false, shouldStop: true };
}

/**
 * 取消 Flow 运行。
 *
 * @param {string} flowUid
 * @param {string|null} cancelTokenUid 兼容旧调用方，传入 null 时从 Redux 读取
 * @param {function} dispatch
 * @param {function} [getState] Redux getState（可选，用于读取 cancelTokenUid）
 */
export async function cancelFlow(flowUid, cancelTokenUid, dispatch, getState) {
  dispatch(cancelFlowRunAction({ flowUid }));

  let token = cancelTokenUid;
  if (!token && getState) {
    try {
      const state = getState();
      const run = state.flowRun?.runs?.[flowUid];
      token = run?.cancelTokenUid || null;
    } catch {
      // 忽略读取失败
    }
  }

  try {
    await cancelNetworkRequest(token);
  } catch (err) {
    // 忽略取消错误
  }
}
