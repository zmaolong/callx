/**
 * Flow 执行器
 *
 * 负责 Flow 的序列执行：从 Start 沿唯一主链依序执行到 End。
 * 执行调度位于 Renderer 进程，通过现有 sendNetworkRequest 发起 HTTP 请求。
 *
 * 运行态不写回 Flow 文件，仅保留在 Redux flowRun slice 中。
 */
import { uuid } from 'utils/common';
import { resolveMainChain, getPredecessorStepId } from 'utils/flow/graph';
import { resolveInputMappings } from 'utils/flow/input-mapping';
import { findEnvironmentInCollection } from 'utils/collections';
import { sendNetworkRequest } from 'utils/network/index';
import { cancelNetworkRequest } from 'utils/network/index';
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

  // 1. 校验图，解析主链
  let mainChain;
  try {
    mainChain = resolveMainChain(nodes, edges);
  } catch (error) {
    return { success: false, error: `图校验失败: ${error.message}` };
  }

  // 2. 初始化运行态
  dispatch(initFlowRun({ flowUid, nodes }));

  const flowRunState = getState().flowRun;
  const run = flowRunState.runs[flowUid];
  if (!run) {
    return { success: false, error: '无法初始化运行态' };
  }

  const cancelTokenUid = uuid();
  let flowContext = {};

  try {
    // 3. 遍历主链（跳过 Start/End，它们没有请求）
    for (const stepId of mainChain) {
      // 检查取消
      const currentRun = getState().flowRun.runs[flowUid];
      if (currentRun?.cancelled) {
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.CANCELLED
        }));
        // 标记后续节点为 skipped
        const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
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
        const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
        return { success: false, error: `节点 ${stepId} 不存在` };
      }

      // 标记为 running（此时尚未解析输入映射，不传 variables）
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
        const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
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
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          error: `输入映射失败: ${errorMsg}`,
          inputVariables: variables
        }));
        const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
        return { success: false, error: errorMsg };
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
          // HTTP 失败
          dispatch(updateFlowNodeStatus({
            flowUid,
            stepId,
            status: NODE_STATUS.FAILED,
            body: response.data || null,
            httpStatus: response.status,
            duration,
            error: response.error,
            inputVariables: variables
          }));
          const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
          if (remaining.length > 0) {
            dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
          }
          dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
          return { success: false, error: response.error };
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
          const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
          if (remaining.length > 0) {
            dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
          }
          dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.CANCELLED }));
          return { success: false, cancelled: true };
        }

        // 网络错误
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          error: error.message || '网络请求失败',
          inputVariables: variables
        }));
        const remaining = mainChain.slice(mainChain.indexOf(stepId) + 1);
        if (remaining.length > 0) {
          dispatch(markNodesSkipped({ flowUid, stepIds: remaining }));
        }
        dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
        return { success: false, error: error.message };
      }
    }

    // 6. 全部执行完成
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.SUCCESS }));
    return { success: true };
  } catch (error) {
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
    return { success: false, error: error.message };
  }
}

/**
 * 取消 Flow 运行。
 *
 * @param {string} flowUid
 * @param {string} cancelTokenUid
 * @param {function} dispatch
 */
export async function cancelFlow(flowUid, cancelTokenUid, dispatch) {
  dispatch(cancelFlowRunAction({ flowUid }));
  try {
    await cancelNetworkRequest(cancelTokenUid);
  } catch (err) {
    // 忽略取消错误
  }
}
