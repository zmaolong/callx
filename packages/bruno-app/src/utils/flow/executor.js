/**
 * Flow 执行器
 *
 * 负责 Flow 的序列执行：从 Start 沿执行路径依序执行到 End，
 * 支持条件分支、错误处理三策略（stop/continue/jump）与真实取消。
 * 执行调度位于 Renderer 进程，通过现有 sendNetworkRequest 发起 HTTP 请求，
 * cancelTokenUid 贯通渲染层 → IPC → 主进程 AbortController，实现请求级真取消。
 *
 * 运行态不写回 Flow 文件，仅保留在 Redux flowRun slice 中。
 */
import { uuid } from 'utils/common';
import { resolveExecutionPath } from 'utils/flow/graph';
import { resolveInputMappings } from 'utils/flow/input-mapping';
import { selectBranch } from 'utils/flow/expressions';
import { findEnvironmentInCollection } from 'utils/collections';
import { sendNetworkRequest, cancelNetworkRequest } from 'utils/network/index';
import { buildRunRecord, saveFlowRunRecord } from 'utils/flow/run-history';
import {
  initFlowRun,
  initNodeRun,
  updateFlowNodeStatus,
  markNodesSkipped,
  setFlowRunStatus,
  cancelFlowRun as cancelFlowRunAction,
  NODE_STATUS,
  FLOW_STATUS
} from 'providers/ReduxStore/slices/flowRun';

/**
 * 从 requestSent 对象中剥离所有不可序列化的字段（如 dataBuffer Uint8Array），
 * 确保存入 Redux 状态的值是可序列化的。
 */
function sanitizeRequestSent(requestSent) {
  if (!requestSent) return null;
  const { dataBuffer, ...rest } = requestSent;
  return Object.keys(rest).length > 0 ? rest : null;
}

/**
 * 主进程取消后以 resolve 返回带 isCancel 标记的响应对象。
 */
function isCancelledResponse(response) {
  return Boolean(response?.isCancel || response?.error === 'REQUEST_CANCELLED');
}

/**
 * 部分路径取消会以 reject 抛出携带 cancelled 字样的错误。
 */
function isCancelledError(error) {
  return typeof error?.message === 'string' && /cancel/i.test(error.message);
}

/**
 * 提取请求断言结果与失败项（主进程将 assertionResults 附加在响应上）。
 */
function extractAssertionResults(response) {
  const results = Array.isArray(response?.assertionResults) ? response.assertionResults : [];
  const failed = results.filter((r) => r.status === 'fail');
  return { results, failed };
}

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
 * @param {string} [options.stopAtNodeId] 运行到此节点为止（含该节点），执行完成后视为成功
 * @returns {Promise<Object>} 执行结果
 */
export async function executeFlow(options) {
  const startedAt = Date.now();
  const result = await executeFlowInternal(options);

  // 运行历史持久化：仅记录真正初始化过运行态的执行（校验失败不记录）；
  // 保存失败静默，不影响运行结果
  try {
    const runState = options.getState?.()?.flowRun?.runs?.[options.flowUid];
    if (runState) {
      const record = buildRunRecord({
        flowUid: options.flowUid,
        collectionUid: options.collectionUid,
        runState,
        startedAt,
        trigger: options.stopAtNodeId ? 'stop-at' : 'full',
        stopAtNodeId: options.stopAtNodeId || null,
        status: result.cancelled ? 'cancelled' : result.success ? 'success' : 'failed'
      });
      await saveFlowRunRecord(record);
    }
  } catch (err) {
    console.warn('[flow] 保存运行历史失败', err);
  }

  return result;
}

async function executeFlowInternal({
  flowUid,
  collectionUid,
  flow,
  collection,
  collectionItems,
  dispatch,
  getState,
  stopAtNodeId
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

  // 2. 并发防护：该 Flow 已有运行在进行时拒绝
  const existingRun = getState?.()?.flowRun?.runs?.[flowUid];
  if (existingRun && existingRun.status === FLOW_STATUS.RUNNING) {
    return { success: false, error: 'Flow 正在运行中，请先等待完成或取消当前运行' };
  }

  // 3. 初始化运行态
  const cancelTokenUid = uuid();
  dispatch(initFlowRun({ flowUid, nodes, cancelTokenUid }));

  const run = getState().flowRun.runs[flowUid];
  if (!run || run.cancelTokenUid !== cancelTokenUid) {
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

  // 集合基础运行变量：每个节点执行时以此为基础叠加输入映射，节点之间互不泄漏
  const baseRuntimeVariables = { ...(collection.runtimeVariables || {}) };

  // 已执行节点集合（防止环）
  const executed = new Set();

  const remainingAfter = (index) => executionPath.slice(index + 1).map((s) => s.stepId);

  // 流程失败收尾：跳过剩余节点并标记整体失败
  const failFlow = (errorMsg, remainStepIds) => {
    if (remainStepIds && remainStepIds.length > 0) {
      dispatch(markNodesSkipped({ flowUid, stepIds: remainStepIds }));
    }
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.FAILED }));
    return { success: false, error: errorMsg };
  };

  // 取消收尾：当前节点 cancelled、剩余节点 skipped、流程整体 cancelled
  const finishCancelled = (currentStepId, remainStepIds) => {
    if (currentStepId) {
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId: currentStepId,
        status: NODE_STATUS.CANCELLED
      }));
    }
    if (remainStepIds && remainStepIds.length > 0) {
      dispatch(markNodesSkipped({ flowUid, stepIds: remainStepIds }));
    }
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.CANCELLED }));
    return { success: false, cancelled: true };
  };

  // 推进执行指针到目标节点，途中节点标记为 skipped
  const advanceTo = (fromIndex, targetIndex) => {
    const between = executionPath.slice(fromIndex + 1, targetIndex).map((s) => s.stepId);
    if (between.length > 0) {
      dispatch(markNodesSkipped({ flowUid, stepIds: between }));
    }
    return targetIndex;
  };

  try {
    let i = 0;
    while (i < executionPath.length) {
      const step = executionPath[i];
      const stepId = step.stepId;

      // 防止环
      if (executed.has(stepId)) {
        return failFlow(`检测到环：节点 ${stepId} 被重复执行`, remainingAfter(i));
      }
      executed.add(stepId);

      // 节点间取消检查
      const currentRun = getState().flowRun.runs[flowUid];
      if (currentRun?.cancelled) {
        return finishCancelled(stepId, remainingAfter(i));
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
        return failFlow(`节点 ${stepId} 不存在`, remainingAfter(i));
      }

      // 标记为 running
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId,
        status: NODE_STATUS.RUNNING
      }));

      // 查找对应的请求 item（有未保存草稿时优先使用草稿，与请求 Tab 的 sendRequest 语义一致）
      const item = collectionItems[node.requestUid];
      if (!item) {
        dispatch(updateFlowNodeStatus({
          flowUid,
          stepId,
          status: NODE_STATUS.FAILED,
          error: `请求 ${node.requestUid} 不存在`
        }));
        return failFlow(`请求 ${node.requestUid} 不存在`, remainingAfter(i));
      }
      const itemWithDraft = item.draft?.request
        ? { ...item, request: item.draft.request }
        : item;

      // 4. 解析输入映射
      const flowContextWithEdges = {
        _nodeResults: flowContext,
        _edges: edges
      };
      const { variables, errors: mappingErrors } = resolveInputMappings(
        node.inputs || [],
        flowContextWithEdges,
        stepId
      );

      if (mappingErrors.length > 0) {
        const errorMsg = mappingErrors.map((e) => `${e.variableName}: ${e.error}`).join('; ');
        const outcome = await handleNodeError({
          flowUid,
          node,
          stepId,
          error: `输入映射失败: ${errorMsg}`,
          inputVariables: variables,
          flowContext,
          dispatch
        });
        if (outcome.type === 'stop') {
          return failFlow(`输入映射失败: ${errorMsg}`, remainingAfter(i));
        }
        if (outcome.type === 'jump') {
          const targetIndex = executionPath.findIndex((s) => s.stepId === outcome.jumpToNodeId);
          if (targetIndex > i) {
            i = advanceTo(i, targetIndex);
            continue;
          }
          return failFlow(`jump 目标不可达：${outcome.jumpToNodeId}`, remainingAfter(i));
        }
        // continue → 走下方分支选择
      } else {
        // 5. 每个节点独立的运行变量：基础变量 + 本节点输入映射，执行后不残留
        collection.runtimeVariables = { ...baseRuntimeVariables, ...variables };
        const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);

        let response = null;
        let duration = 0;
        let requestError = null;
        try {
          const startTime = Date.now();
          response = await sendNetworkRequest(
            itemWithDraft,
            collection,
            environment,
            collection.runtimeVariables,
            cancelTokenUid
          );
          duration = Date.now() - startTime;
        } catch (error) {
          if (isCancelledError(error)) {
            return finishCancelled(stepId, remainingAfter(i));
          }
          requestError = error;
        }

        // 响应级取消（主进程 abort 后以 isCancel 标记 resolve 返回）
        if (response && isCancelledResponse(response)) {
          return finishCancelled(stepId, remainingAfter(i));
        }

        if (requestError || response?.error) {
          const error = requestError ? (requestError.message || '网络请求失败') : response.error;
          const outcome = await handleNodeError({
            flowUid,
            node,
            stepId,
            error,
            body: response?.data || null,
            httpStatus: response?.status || null,
            duration: response?.duration ?? duration,
            requestSent: sanitizeRequestSent(response?.requestSent),
            inputVariables: variables,
            flowContext,
            dispatch
          });
          if (outcome.type === 'stop') {
            return failFlow(error, remainingAfter(i));
          }
          if (outcome.type === 'jump') {
            const targetIndex = executionPath.findIndex((s) => s.stepId === outcome.jumpToNodeId);
            if (targetIndex > i) {
              i = advanceTo(i, targetIndex);
              continue;
            }
            return failFlow(`jump 目标不可达：${outcome.jumpToNodeId}`, remainingAfter(i));
          }
          // continue → 走下方分支选择
        } else {
          // 断言检查：任一断言失败即节点失败，走错误处理策略
          const { results: assertionResults, failed: failedAssertions } = extractAssertionResults(response);
          if (failedAssertions.length > 0) {
            const assertError = `断言失败 (${assertionResults.length - failedAssertions.length}/${assertionResults.length} 通过): ${failedAssertions.map((a) => a.lhsExpr).join('; ')}`;
            const outcome = await handleNodeError({
              flowUid,
              node,
              stepId,
              error: assertError,
              body: response.data || null,
              httpStatus: response.status || null,
              duration: response.duration ?? duration,
              requestSent: sanitizeRequestSent(response.requestSent),
              inputVariables: variables,
              assertionResults,
              flowContext,
              dispatch
            });
            if (outcome.type === 'stop') {
              return failFlow(assertError, remainingAfter(i));
            }
            if (outcome.type === 'jump') {
              const targetIndex = executionPath.findIndex((s) => s.stepId === outcome.jumpToNodeId);
              if (targetIndex > i) {
                i = advanceTo(i, targetIndex);
                continue;
              }
              return failFlow(`jump 目标不可达：${outcome.jumpToNodeId}`, remainingAfter(i));
            }
            // continue → 走下方分支选择（响应数据已在 flowContext，条件仍可引用）
          } else {
            // 成功
            flowContext[stepId] = {
              body: response.data,
              status: response.status,
              duration: response.duration ?? duration,
              headers: response.headers || null,
              statusText: response.statusText ?? null
            };

            dispatch(updateFlowNodeStatus({
              flowUid,
              stepId,
              status: NODE_STATUS.SUCCESS,
              body: response.data,
              httpStatus: response.status,
              duration,
              inputVariables: variables,
              requestSent: sanitizeRequestSent(response.requestSent),
              headers: response.headers || null,
              dataBuffer: response.dataBuffer || null,
              size: response.size ?? null,
              statusText: response.statusText ?? null,
              assertionResults: assertionResults.length > 0 ? assertionResults : null
            }));

            // 「运行到此节点」：执行完目标节点后立即视为成功结束
            if (stepId === stopAtNodeId) {
              dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.SUCCESS }));
              return { success: true, stoppedAt: stopAtNodeId };
            }
          }
        }
      }

      // 6. 分支选择——成功与 continue 失败统一在此评估出边条件
      const outgoingEdges = outgoingEdgeMap.get(stepId) || [];
      const selectedEdge = selectBranch(outgoingEdges, flowContext);
      if (selectedEdge) {
        if (selectedEdge.target === 'end') {
          // 到达 End，执行完成
          break;
        }
        const targetIndex = executionPath.findIndex((s) => s.stepId === selectedEdge.target);
        if (targetIndex > i) {
          i = advanceTo(i, targetIndex);
          continue;
        }
        if (targetIndex >= 0) {
          return failFlow(`检测到回跳：节点 ${selectedEdge.target} 已执行过`, remainingAfter(i));
        }
        return failFlow(`分支目标 ${selectedEdge.target} 不在执行路径上`, remainingAfter(i));
      }

      if (outgoingEdges.length === 0) {
        return failFlow(`节点 ${node.alias || stepId} 没有连接到下游节点`, remainingAfter(i));
      }
      // 无可满足的分支且无默认边：流程终止为失败，而不是误报成功
      return failFlow(
        `节点 ${node.alias || stepId} 没有可满足的出边条件，流程终止`,
        remainingAfter(i)
      );
    }

    // 7. 全部执行完成
    dispatch(setFlowRunStatus({ flowUid, status: FLOW_STATUS.SUCCESS }));
    return { success: true };
  } catch (error) {
    return failFlow(error?.message || 'Flow 执行异常', []);
  }
}

/**
 * 单节点运行：仅执行指定节点，输入映射取自其他节点的已缓存运行结果。
 *
 * 与整链运行不同：不适用错误处理策略（continue/jump 是链路概念），
 * 不改变 Flow 整体运行状态，其他节点的缓存结果保持不变。
 *
 * @returns {Promise<Object>} 执行结果
 */
export async function executeSingleNode({
  flowUid,
  collectionUid,
  flow,
  collection,
  collectionItems,
  stepId,
  dispatch,
  getState
}) {
  const nodes = flow?.nodes || [];
  const edges = flow?.edges || [];

  // 并发防护：整链运行中拒绝单跑
  const existingRun = getState?.()?.flowRun?.runs?.[flowUid];
  if (existingRun && existingRun.status === FLOW_STATUS.RUNNING) {
    return { success: false, error: 'Flow 正在运行中，请先等待完成或取消当前运行' };
  }

  const node = nodes.find((n) => n.id === stepId);
  if (!node || node.type !== 'request') {
    return { success: false, error: '目标节点不存在或不可执行' };
  }
  const item = collectionItems[node.requestUid];
  if (!item) {
    dispatch(updateFlowNodeStatus({
      flowUid,
      stepId,
      status: NODE_STATUS.FAILED,
      error: `请求 ${node.requestUid} 不存在`
    }));
    return { success: false, error: `请求 ${node.requestUid} 不存在` };
  }
  const itemWithDraft = item.draft?.request
    ? { ...item, request: item.draft.request }
    : item;

  // 初始化运行态（仅重置目标节点，保留其他节点缓存）
  const cancelTokenUid = uuid();
  dispatch(initNodeRun({ flowUid, nodes, stepId, cancelTokenUid }));

  // 从既有运行态收集上游缓存作为 flowContext
  const run = getState().flowRun.runs[flowUid];
  if (!run) {
    return { success: false, error: '无法初始化运行态' };
  }
  const flowContext = {};
  for (const [cachedStepId, cachedState] of Object.entries(run.nodes || {})) {
    if (cachedStepId === stepId) continue;
    if (cachedState?.body !== null && cachedState?.body !== undefined) {
      flowContext[cachedStepId] = {
        body: cachedState.body,
        status: cachedState.httpStatus,
        duration: cachedState.duration
      };
    }
  }

  // 解析输入映射（上游节点从未运行过时表达式将解析失败，提示先运行）
  const flowContextWithEdges = {
    _nodeResults: flowContext,
    _edges: edges
  };
  const { variables, errors: mappingErrors } = resolveInputMappings(
    node.inputs || [],
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
      inputVariables: variables || null
    }));
    return { success: false, error: `输入映射失败: ${errorMsg}` };
  }

  // 单跑同样只注入本节点映射变量，不与上次运行残留叠加
  collection.runtimeVariables = { ...(collection.runtimeVariables || {}), ...variables };
  const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);

  let response = null;
  let duration = 0;
  try {
    const startTime = Date.now();
    response = await sendNetworkRequest(
      itemWithDraft,
      collection,
      environment,
      collection.runtimeVariables,
      cancelTokenUid
    );
    duration = Date.now() - startTime;
  } catch (error) {
    if (isCancelledError(error)) {
      dispatch(updateFlowNodeStatus({
        flowUid,
        stepId,
        status: NODE_STATUS.CANCELLED,
        inputVariables: variables
      }));
      return { success: false, cancelled: true };
    }

    dispatch(updateFlowNodeStatus({
      flowUid,
      stepId,
      status: NODE_STATUS.FAILED,
      error: error.message || '网络请求失败',
      inputVariables: variables
    }));
    return { success: false, error: error.message || '网络请求失败' };
  }

  if (isCancelledResponse(response)) {
    dispatch(updateFlowNodeStatus({
      flowUid,
      stepId,
      status: NODE_STATUS.CANCELLED,
      inputVariables: variables
    }));
    return { success: false, cancelled: true };
  }

  if (response?.error) {
    dispatch(updateFlowNodeStatus({
      flowUid,
      stepId,
      status: NODE_STATUS.FAILED,
      body: response.data || null,
      httpStatus: response.status,
      duration: response.duration ?? duration,
      error: response.error,
      inputVariables: variables,
      requestSent: sanitizeRequestSent(response.requestSent)
    }));
    return { success: false, error: response.error };
  }

  // 断言检查：单跑不走错误策略，但断言失败同样判定节点失败
  const { results: assertionResults, failed: failedAssertions } = extractAssertionResults(response);
  if (failedAssertions.length > 0) {
    const assertError = `断言失败 (${assertionResults.length - failedAssertions.length}/${assertionResults.length} 通过): ${failedAssertions.map((a) => a.lhsExpr).join('; ')}`;
    dispatch(updateFlowNodeStatus({
      flowUid,
      stepId,
      status: NODE_STATUS.FAILED,
      body: response.data || null,
      httpStatus: response.status,
      duration: response.duration ?? duration,
      error: assertError,
      inputVariables: variables,
      requestSent: sanitizeRequestSent(response.requestSent),
      headers: response.headers || null,
      dataBuffer: response.dataBuffer || null,
      size: response.size ?? null,
      statusText: response.statusText ?? null,
      assertionResults
    }));
    return { success: false, error: assertError };
  }

  dispatch(updateFlowNodeStatus({
    flowUid,
    stepId,
    status: NODE_STATUS.SUCCESS,
    body: response.data,
    httpStatus: response.status,
    duration,
    inputVariables: variables,
    requestSent: sanitizeRequestSent(response.requestSent),
    headers: response.headers || null,
    dataBuffer: response.dataBuffer || null,
    size: response.size ?? null,
    statusText: response.statusText ?? null,
    assertionResults: assertionResults.length > 0 ? assertionResults : null
  }));
  return { success: true };
}

/**
 * 处理节点错误——根据错误处理策略标记节点状态并返回流程走向。
 *
 * 跳转/跳过剩余节点等执行指针推进由 executeFlow 统一处理，本函数只负责
 * 节点级状态落盘与 flowContext 记录。
 *
 * @returns {Promise<{ type: 'stop' | 'continue' | 'jump', jumpToNodeId?: string }>}
 */
async function handleNodeError({
  flowUid,
  node,
  stepId,
  error,
  body,
  httpStatus,
  duration,
  requestSent,
  inputVariables,
  assertionResults,
  flowContext,
  dispatch
}) {
  const errorHandler = node?.errorHandler;
  const strategy = errorHandler?.strategy || 'stop';

  // 三种策略下节点本身都标记为失败
  dispatch(updateFlowNodeStatus({
    flowUid,
    stepId,
    status: NODE_STATUS.FAILED,
    body: body || null,
    httpStatus: httpStatus || null,
    duration: duration || null,
    error,
    inputVariables: inputVariables || null,
    requestSent: requestSent || null,
    assertionResults: assertionResults || null
  }));

  if (strategy === 'continue') {
    // 在 flowContext 中记录失败结果，供出边条件引用（status 记为 0 表示无 HTTP 响应）
    flowContext[stepId] = {
      body: body || null,
      status: httpStatus || 0,
      duration: duration || 0,
      error
    };
    return { type: 'continue' };
  }

  if (strategy === 'jump') {
    const targetId = errorHandler?.jumpToNodeId;
    if (targetId) {
      return { type: 'jump', jumpToNodeId: targetId };
    }
    // 无跳转目标，回退到 stop
  }

  return { type: 'stop' };
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
