/**
 * Flow 执行器
 *
 * 负责 Flow 的序列执行：从 Start 沿执行路径依序执行到 End，
 * 支持条件分支、合流（不等长分支 DAG）、错误处理三策略（stop/continue/jump）与真实取消。
 * 执行调度位于 Renderer 进程，通过现有 sendNetworkRequest 发起 HTTP 请求，
 * cancelTokenUid 贯通渲染层 → IPC → 主进程 AbortController，实现请求级真取消。
 *
 * 运行态不写回 Flow 文件，仅保留在 Redux flowRun slice 中。
 *
 * 结构说明：executeFlowInternal 负责运行态生命周期（校验/初始化/历史守卫），
 * runExecutionPath 驱动主循环；单步逻辑收拢在 runStep，通过「指令」对象
 * （goto/end/fail/cancelled）向主循环声明走向，主循环不感知节点执行细节。
 * 对 Redux 的读写收拢在 createRunStore 适配层，核心循环不直接依赖 action 形状。
 */
import { uuid } from 'utils/common';
import { resolveExecutionPath, NODE_TYPES, LOOP_EDGE_KINDS } from 'utils/flow/graph';
import { resolveInputMappings } from 'utils/flow/input-mapping';
import { selectBranch, evaluateFlowExpression } from 'utils/flow/expressions';
import { findEnvironmentInCollection } from 'utils/collections';
import { sendNetworkRequest, cancelNetworkRequest } from 'utils/network/index';
import { buildRunRecord, saveFlowRunRecord } from 'utils/flow/run-history';
import {
  initFlowRun,
  initNodeRun,
  updateFlowNodeStatus,
  resetNodeStatus,
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
 * Redux flowRun 适配层：执行循环只依赖这组方法，不直接拼 action。
 */
function createRunStore(flowUid, dispatch, getState) {
  const getRun = () => getState?.()?.flowRun?.runs?.[flowUid];
  return {
    getRun,
    initRun: (nodes, cancelTokenUid) => dispatch(initFlowRun({ flowUid, nodes, cancelTokenUid })),
    markRunning: (stepId) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, status: NODE_STATUS.RUNNING })),
    markFailure: (stepId, fields) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, status: NODE_STATUS.FAILED, ...fields })),
    markMissing: (stepId, error) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, status: NODE_STATUS.FAILED, error })),
    markSuccess: (stepId, fields) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, status: NODE_STATUS.SUCCESS, ...fields })),
    markCancelled: (stepId) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, status: NODE_STATUS.CANCELLED })),
    // 通用字段补丁（循环节点的 loopProgress/rounds 等增量更新）
    patchNode: (stepId, fields) =>
      dispatch(updateFlowNodeStatus({ flowUid, stepId, ...fields })),
    skipNodes: (stepIds) => {
      if (stepIds && stepIds.length > 0) {
        dispatch(markNodesSkipped({ flowUid, stepIds }));
      }
    },
    resetNode: (stepId) => dispatch(resetNodeStatus({ flowUid, stepId })),
    setFlowStatus: (status) => dispatch(setFlowRunStatus({ flowUid, status })),
    isCancelRequested: () => Boolean(getRun()?.cancelled)
  };
}

/**
 * 执行 Flow。
 *
 * @param {Object} options
 * @param {string} options.flowUid Flow 的 uid
 * @param {string} options.collectionUid 集合 uid
 * @param {Object} options.flow Flow 对象（包含 nodes 和 edges）
 * @param {Object} options.collection 集合对象（浅拷贝副本）
 * @param {Object} options.collectionItems Flow 目录中的 item 映射 { [itemUid]: item }
 * @param {function} options.dispatch Redux dispatch
 * @param {function} options.getState Redux getState
 * @param {string} [options.stopAtNodeId] 运行到此节点为止（含该节点），执行完成后视为成功
 * @returns {Promise<Object>} 执行结果；initialized 为 false 表示未初始化运行态
 *   （校验失败 / 并发拒绝），调用方不应据此产生运行历史
 */
export async function executeFlow(options) {
  const startedAt = Date.now();
  const result = await executeFlowInternal(options);

  // 运行历史持久化：仅记录真正初始化过运行态的执行。
  // 校验失败 / 并发拒绝时未初始化运行态，若 Redux 中残留上次运行的状态，
  // 不加判断会把陈旧状态落成一条"幽灵"历史记录。
  // 保存失败静默，不影响运行结果
  try {
    const runState = options.getState?.()?.flowRun?.runs?.[options.flowUid];
    if (runState && result.initialized !== false) {
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
    return { success: false, initialized: false, error: `图校验失败: ${error.message}` };
  }

  // 2. 并发防护：该 Flow 已有运行在进行时拒绝
  const runStore = createRunStore(flowUid, dispatch, getState);
  const existingRun = runStore.getRun();
  if (existingRun && existingRun.status === FLOW_STATUS.RUNNING) {
    return { success: false, initialized: false, error: 'Flow 正在运行中，请先等待完成或取消当前运行' };
  }

  // 3. 初始化运行态
  const cancelTokenUid = uuid();
  runStore.initRun(nodes, cancelTokenUid);

  const run = runStore.getRun();
  if (!run || run.cancelTokenUid !== cancelTokenUid) {
    return { success: false, initialized: false, error: '无法初始化运行态' };
  }

  try {
    return await runExecutionPath({
      executionPath,
      nodes,
      edges,
      collection,
      collectionItems,
      runStore,
      cancelTokenUid,
      stopAtNodeId
    });
  } catch (error) {
    // runExecutionPath 内部已兜底，此处仅防御其自身构造阶段的异常
    runStore.setFlowStatus(FLOW_STATUS.FAILED);
    return { success: false, error: error?.message || 'Flow 执行异常' };
  }
}

/**
 * 主循环：沿线性执行路径推进，逐步消费 runStep 返回的指令。
 */
async function runExecutionPath({
  executionPath,
  nodes,
  edges,
  collection,
  collectionItems,
  runStore,
  cancelTokenUid,
  stopAtNodeId
}) {
  // 集合基础运行变量：每个节点执行时以此为基础叠加输入映射，节点之间互不泄漏
  const baseRuntimeVariables = { ...(collection.runtimeVariables || {}) };
  // 已执行节点集合（防止环；合流回退只允许指向未执行的节点）
  const executed = new Set();
  // 节点响应上下文：stepId → { body, status, duration, headers, statusText, error? }
  const flowContext = Object.create(null);
  // 当前执行下标（供异常收尾跳过剩余节点）
  let currentIndex = 0;

  const remainingAfter = (index) => executionPath.slice(index + 1).map((s) => s.stepId);

  try {
    while (currentIndex < executionPath.length) {
      const directive = await runStep({
        index: currentIndex,
        executionPath,
        nodes,
        edges,
        collection,
        collectionItems,
        runStore,
        cancelTokenUid,
        stopAtNodeId,
        baseRuntimeVariables,
        executed,
        flowContext
      });

      switch (directive.kind) {
        case 'goto':
          currentIndex = directive.index;
          break;
        case 'end': {
          runStore.setFlowStatus(FLOW_STATUS.SUCCESS);
          const result = { success: true };
          if (directive.stoppedAt) {
            result.stoppedAt = directive.stoppedAt;
          }
          return result;
        }
        case 'fail': {
          currentIndex = directive.index;
          runStore.skipNodes(remainingAfter(currentIndex));
          runStore.setFlowStatus(FLOW_STATUS.FAILED);
          return { success: false, error: directive.error };
        }
        case 'cancelled': {
          currentIndex = directive.index;
          if (directive.stepId) {
            runStore.markCancelled(directive.stepId);
          }
          runStore.skipNodes(remainingAfter(currentIndex));
          runStore.setFlowStatus(FLOW_STATUS.CANCELLED);
          return { success: false, cancelled: true };
        }
        default:
          throw new Error('Flow 执行异常：未知的执行指令');
      }
    }
  } catch (error) {
    // 未预期的异常：跳过剩余节点并整体失败
    runStore.skipNodes(remainingAfter(currentIndex));
    runStore.setFlowStatus(FLOW_STATUS.FAILED);
    return { success: false, error: error?.message || 'Flow 执行异常' };
  }

  // 全部执行完成
  runStore.setFlowStatus(FLOW_STATUS.SUCCESS);
  return { success: true };
}

/**
 * 执行单个节点并返回走向指令。
 *
 * @returns {Promise<{ kind: 'goto'|'end'|'fail'|'cancelled', index: number, stepId?: string, error?: string }>}
 */
async function runStep({
  index,
  executionPath,
  nodes,
  edges,
  collection,
  collectionItems,
  runStore,
  cancelTokenUid,
  stopAtNodeId,
  baseRuntimeVariables,
  executed,
  flowContext
}) {
  const step = executionPath[index];
  const stepId = step.stepId;

  // 防止环：合流回退（resetAndGoto）前会确认目标未执行过，走到这里即真环
  if (executed.has(stepId)) {
    return { kind: 'fail', index, error: `检测到环：节点 ${stepId} 被重复执行` };
  }
  executed.add(stepId);

  // 节点间取消检查
  if (runStore.isCancelRequested()) {
    return { kind: 'cancelled', index, stepId };
  }

  // 查找节点
  const node = nodes.find((n) => n.id === stepId);
  if (!node) {
    runStore.markMissing(stepId, `节点 ${stepId} 不存在`);
    return { kind: 'fail', index, error: `节点 ${stepId} 不存在` };
  }

  runStore.markRunning(stepId);

  // 循环节点：控制器接管循环体与主链推进（循环体节点不经过主循环）
  if (node.type === NODE_TYPES.LOOP) {
    return runLoopStep({
      node,
      index,
      executionPath,
      nodes,
      edges,
      collection,
      collectionItems,
      runStore,
      cancelTokenUid,
      stopAtNodeId,
      baseRuntimeVariables,
      executed,
      flowContext
    });
  }

  // 并行组节点：控制器接管组内子请求的并行执行（子请求节点不经过主循环）
  if (node.type === NODE_TYPES.PARALLEL) {
    return runParallelGroupStep({
      node,
      index,
      executionPath,
      nodes,
      edges,
      collection,
      collectionItems,
      runStore,
      cancelTokenUid,
      stopAtNodeId,
      baseRuntimeVariables,
      executed,
      flowContext
    });
  }

  // 查找对应的请求 item（有未保存草稿时优先使用草稿，与请求 Tab 的 sendRequest 语义一致）
  const item = collectionItems[node.requestUid];
  if (!item) {
    runStore.markMissing(stepId, `请求 ${node.requestUid} 不存在`);
    return { kind: 'fail', index, error: `请求 ${node.requestUid} 不存在` };
  }

  const outcome = await executeRequestNode({
    node,
    stepId,
    item,
    collection,
    runStore,
    flowContext,
    edges,
    baseRuntimeVariables,
    cancelTokenUid
  });

  if (outcome.type === 'cancelled') {
    return { kind: 'cancelled', index, stepId };
  }
  if (outcome.type === 'success') {
    return selectNextBranch({ stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext });
  }
  return afterErrorOutcome(outcome, { stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext });
}

/**
 * 请求节点执行核心（主链与循环体共用）：
 * 输入映射解析 → 运行变量注入 → 发送请求 → 断言检查 → 错误策略。
 *
 * @returns {Promise<{ type: 'success'|'continue'|'jump'|'stop'|'cancelled', jumpToNodeId?: string, error?: string }>}
 */
async function executeRequestNode({
  node,
  stepId,
  item,
  collection,
  runStore,
  flowContext,
  edges,
  baseRuntimeVariables,
  cancelTokenUid
}) {
  const itemWithDraft = item.draft?.request
    ? { ...item, request: item.draft.request }
    : item;

  // 解析输入映射
  const { variables, errors: mappingErrors } = resolveInputMappings(
    node.inputs || [],
    { _nodeResults: flowContext, _edges: edges },
    stepId
  );

  if (mappingErrors.length > 0) {
    const errorMsg = mappingErrors.map((e) => `${e.variableName}: ${e.error}`).join('; ');
    return applyErrorStrategy({
      node,
      stepId,
      runStore,
      flowContext,
      error: `输入映射失败: ${errorMsg}`,
      inputVariables: variables
    });
  }

  // 每个节点独立的运行变量：基础变量 + 本节点输入映射，执行后不残留
  collection.runtimeVariables = { ...baseRuntimeVariables, ...variables };
  const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);

  // 发起请求
  const { response, requestError, duration, cancelled } = await sendStepRequest({
    item: itemWithDraft,
    collection,
    environment,
    runtimeVariables: collection.runtimeVariables,
    cancelTokenUid
  });
  if (cancelled) {
    return { type: 'cancelled' };
  }

  // 请求失败：走错误策略
  if (requestError || response?.error) {
    const error = requestError ? (requestError.message || '网络请求失败') : response.error;
    return applyErrorStrategy({
      node,
      stepId,
      runStore,
      flowContext,
      error,
      body: response?.data || null,
      httpStatus: response?.status || null,
      duration: response?.duration ?? duration,
      requestSent: sanitizeRequestSent(response?.requestSent),
      inputVariables: variables
    });
  }

  // 断言检查：任一断言失败即节点失败，走错误处理策略
  const { results: assertionResults, failed: failedAssertions } = extractAssertionResults(response);
  if (failedAssertions.length > 0) {
    const assertError = `断言失败 (${assertionResults.length - failedAssertions.length}/${assertionResults.length} 通过): ${failedAssertions.map((a) => a.lhsExpr).join('; ')}`;
    return applyErrorStrategy({
      node,
      stepId,
      runStore,
      flowContext,
      error: assertError,
      body: response.data || null,
      httpStatus: response.status || null,
      duration: response.duration ?? duration,
      requestSent: sanitizeRequestSent(response.requestSent),
      inputVariables: variables,
      assertionResults
    });
  }

  // 成功：记录响应上下文并落盘节点状态
  flowContext[stepId] = {
    body: response.data,
    status: response.status,
    duration: response.duration ?? duration,
    headers: response.headers || null,
    statusText: response.statusText ?? null
  };
  runStore.markSuccess(stepId, {
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
  });
  return { type: 'success' };
}

// 循环节点默认迭代上限（可在节点配置中调低/调高）
const DEFAULT_LOOP_MAX_ITERATIONS = 1000;

// 轮次摘要中 item 的展示截断长度（控制历史体积）
const LOOP_ITEM_SUMMARY_MAX = 120;

const summarizeLoopItem = (item) => {
  if (item === null || item === undefined) return String(item);
  let text;
  try {
    text = typeof item === 'string' ? item : JSON.stringify(item);
  } catch {
    text = String(item);
  }
  return text.length > LOOP_ITEM_SUMMARY_MAX ? `${text.slice(0, LOOP_ITEM_SUMMARY_MAX)}…` : text;
};

/**
 * 循环节点控制器。
 *
 * 执行模型（线性路径架构下的循环语义）：
 * - 循环体的图表达：loop --body--> 体链（BFS 序中紧跟 loop 的连续段），
 *   体链尾 --back--> loop（回边，仅用于声明体段范围，运行时不真正回跳），
 *   loop --done--> 完成后继续的链。
 * - 数据源解析为 items 数组后逐轮执行体段：每轮重置体段节点状态、
 *   注入迭代上下文 flowContext[loopId] = { item, index, iterations, collected }，
 *   体链节点通过 {{$flow.<loopId>.item}} 等表达式引用（经输入映射转为请求变量）。
 * - 体段节点失败沿用错误策略：stop=终止流程；continue=跳过本轮剩余体段继续下一轮；
 *   jump 由校验层禁止（循环体内不支持）。
 * - 收集表达式每轮求值一次：数组拼接、标量/对象追加，经 collected 供 done 链引用。
 * - 完成后主链推进到 done 目标；体段节点保留最后一轮终态，loop 节点记录
 *   loopProgress（进度徽标）与 rounds（轮次摘要，不含响应体）。
 */
async function runLoopStep({
  node,
  index,
  executionPath,
  nodes,
  edges,
  collection,
  collectionItems,
  runStore,
  cancelTokenUid,
  stopAtNodeId,
  baseRuntimeVariables,
  executed,
  flowContext
}) {
  const stepId = node.id;

  // 1. 连线计划
  const outEdges = edges.filter((e) => e.source === stepId);
  const bodyEdge = outEdges.find((e) => e.loopKind === LOOP_EDGE_KINDS.BODY);
  const doneEdge = outEdges.find((e) => e.loopKind === LOOP_EDGE_KINDS.DONE);
  const backEdges = edges.filter((e) => e.target === stepId && e.loopKind === LOOP_EDGE_KINDS.BACK);
  if (!bodyEdge || !doneEdge || backEdges.length !== 1) {
    const error = '循环节点连线不完整（需要恰好一条循环体出边、一条完成后出边和一条回边）';
    runStore.markMissing(stepId, error);
    return { kind: 'fail', index, error };
  }

  const bodyStart = executionPath.findIndex((s) => s.stepId === bodyEdge.target);
  const bodyEnd = executionPath.findIndex((s) => s.stepId === backEdges[0].source);
  const doneIndex = executionPath.findIndex((s) => s.stepId === doneEdge.target);
  if (bodyStart === -1 || bodyEnd === -1 || doneIndex === -1 || bodyStart <= index || bodyEnd < bodyStart || doneIndex <= index) {
    const error = '循环节点执行路径不完整（循环体或完成后链不在执行路径上）';
    runStore.markMissing(stepId, error);
    return { kind: 'fail', index, error };
  }

  const bodySteps = executionPath.slice(bodyStart, bodyEnd + 1);
  const bodyStepIds = bodySteps.map((s) => s.stepId);
  const bodyStepIdSet = new Set(bodyStepIds);
  // 循环体节点由控制器执行，主循环不得再次进入
  bodyStepIds.forEach((id) => executed.add(id));

  // 2. 数据源解析为 items 数组
  const source = node.loopConfig?.source || {};
  let items = null;
  if (source.kind === 'literal') {
    try {
      items = typeof source.value === 'string' ? JSON.parse(source.value) : source.value;
    } catch {
      items = null;
    }
    if (!Array.isArray(items)) {
      const error = '循环数据源无效：字面量必须是 JSON 数组';
      runStore.patchNode(stepId, { status: NODE_STATUS.FAILED, error });
      return { kind: 'fail', index, error };
    }
  } else if (source.kind === 'variable') {
    const value = collection.runtimeVariables?.[source.variableName];
    if (!Array.isArray(value)) {
      const error = `循环数据源无效：变量 ${source.variableName} 不是数组`;
      runStore.patchNode(stepId, { status: NODE_STATUS.FAILED, error });
      return { kind: 'fail', index, error };
    }
    items = value;
  } else {
    const result = evaluateFlowExpression(source.expression, flowContext);
    if (!result || !Array.isArray(result.value)) {
      const error = `循环数据源无效：表达式未解析出数组（${source.expression}）`;
      runStore.patchNode(stepId, { status: NODE_STATUS.FAILED, error });
      return { kind: 'fail', index, error };
    }
    items = result.value;
  }

  const maxIterations = Number(node.loopConfig?.maxIterations) > 0
    ? Math.floor(Number(node.loopConfig.maxIterations))
    : DEFAULT_LOOP_MAX_ITERATIONS;
  if (items.length > maxIterations) {
    const error = `循环迭代次数 ${items.length} 超过上限 ${maxIterations}`;
    runStore.patchNode(stepId, { status: NODE_STATUS.FAILED, error });
    return { kind: 'fail', index, error };
  }

  // 3. 逐轮迭代执行体段
  const collectExpression = String(node.loopConfig?.collectExpression || '').trim();
  const collected = [];
  const rounds = [];

  for (let iter = 0; iter < items.length; iter++) {
    if (runStore.isCancelRequested()) {
      runStore.patchNode(stepId, {
        loopProgress: { current: iter, total: items.length, collectedCount: collected.length },
        rounds
      });
      return { kind: 'cancelled', index, stepId };
    }

    // 迭代上下文：体链节点通过 {{$flow.<loopId>.item}} 等引用（经输入映射转请求变量）
    flowContext[stepId] = {
      item: items[iter],
      index: iter,
      iterations: items.length,
      collected
    };
    runStore.patchNode(stepId, {
      status: NODE_STATUS.RUNNING,
      loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length }
    });

    const roundStartedAt = Date.now();
    let roundError = null;
    let stopAtHit = false;
    let cancelled = false;

    for (let idx = bodyStart; idx <= bodyEnd; idx++) {
      const bodyStepId = executionPath[idx].stepId;
      const bodyNode = nodes.find((n) => n.id === bodyStepId);
      if (!bodyNode || bodyNode.type !== NODE_TYPES.REQUEST) {
        const error = `循环体节点 ${bodyStepId} 不可执行`;
        runStore.markMissing(bodyStepId, error);
        rounds.push({
          index: iter,
          item: summarizeLoopItem(items[iter]),
          status: 'failed',
          error,
          durationMs: Date.now() - roundStartedAt
        });
        runStore.patchNode(stepId, {
          status: NODE_STATUS.FAILED,
          error: `第 ${iter + 1} 轮循环失败：${error}`,
          loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length },
          rounds
        });
        return { kind: 'fail', index, error: `第 ${iter + 1} 轮循环失败：${error}` };
      }

      // 每轮重置体段节点状态，避免上一轮响应残留误导
      runStore.resetNode(bodyStepId);
      runStore.markRunning(bodyStepId);

      const bodyItem = collectionItems[bodyNode.requestUid];
      if (!bodyItem) {
        const error = `请求 ${bodyNode.requestUid} 不存在`;
        runStore.markMissing(bodyStepId, error);
        rounds.push({
          index: iter,
          item: summarizeLoopItem(items[iter]),
          status: 'failed',
          error,
          durationMs: Date.now() - roundStartedAt
        });
        runStore.patchNode(stepId, {
          status: NODE_STATUS.FAILED,
          error: `第 ${iter + 1} 轮循环失败：${error}`,
          loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length },
          rounds
        });
        return { kind: 'fail', index, error: `第 ${iter + 1} 轮循环失败：${error}` };
      }

      const outcome = await executeRequestNode({
        node: bodyNode,
        stepId: bodyStepId,
        item: bodyItem,
        collection,
        runStore,
        flowContext,
        edges,
        baseRuntimeVariables,
        cancelTokenUid
      });

      if (outcome.type === 'cancelled') {
        cancelled = true;
        break;
      }
      if (outcome.type === 'stop' || outcome.type === 'jump') {
        // 循环体内 stop / jump（jump 由校验层禁止，此处兜底）→ 终止整个循环与流程
        roundError = outcome.error || '循环体执行失败';
        runStore.patchNode(stepId, {
          status: NODE_STATUS.FAILED,
          error: `第 ${iter + 1} 轮循环失败：${roundError}`,
          loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length },
          rounds
        });
        rounds.push({
          index: iter,
          item: summarizeLoopItem(items[iter]),
          status: 'failed',
          error: roundError,
          durationMs: Date.now() - roundStartedAt
        });
        return { kind: 'fail', index, error: `第 ${iter + 1} 轮循环失败：${roundError}` };
      }
      if (outcome.type === 'continue') {
        // 忽略错误继续：跳过本轮剩余体段，下一轮恢复
        roundError = outcome.error || '循环体节点失败（continue 策略）';
        const restIds = executionPath.slice(idx + 1, bodyEnd + 1).map((s) => s.stepId);
        runStore.skipNodes(restIds);
        break;
      }
      // success → 继续体段下一个节点

      // 「运行到此」落在循环体内：执行到该节点即整体收尾
      if (stopAtNodeId && bodyStepId === stopAtNodeId) {
        stopAtHit = true;
        break;
      }
    }

    rounds.push({
      index: iter,
      item: summarizeLoopItem(items[iter]),
      status: roundError ? 'failed' : 'success',
      error: roundError,
      durationMs: Date.now() - roundStartedAt
    });

    if (cancelled) {
      runStore.patchNode(stepId, {
        loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length },
        rounds
      });
      return { kind: 'cancelled', index, stepId };
    }

    if (stopAtHit) {
      runStore.patchNode(stepId, {
        status: NODE_STATUS.SUCCESS,
        loopProgress: { current: iter + 1, total: items.length, collectedCount: collected.length },
        rounds
      });
      return { kind: 'end', index, stoppedAt: stopAtNodeId };
    }

    // 收集表达式：数组拼接、标量/对象追加；求值失败该轮跳过
    if (collectExpression) {
      try {
        const result = evaluateFlowExpression(collectExpression, flowContext);
        if (result && result.value !== undefined && result.value !== null) {
          if (Array.isArray(result.value)) {
            collected.push(...result.value);
          } else {
            collected.push(result.value);
          }
        }
      } catch {
        // 收集失败不影响循环推进
      }
    }
  }

  // 4. 完成：主链推进到完成后链；体段节点保留最后一轮终态
  runStore.patchNode(stepId, {
    status: NODE_STATUS.SUCCESS,
    loopProgress: { current: items.length, total: items.length, collectedCount: collected.length },
    rounds
  });
  const betweenSkip = executionPath
    .slice(index + 1, doneIndex)
    .map((s) => s.stepId)
    .filter((id) => !bodyStepIdSet.has(id));
  runStore.skipNodes(betweenSkip);

  if (stopAtNodeId && stepId === stopAtNodeId) {
    return { kind: 'end', index, stoppedAt: stopAtNodeId };
  }
  return { kind: 'goto', index: doneIndex };
}

/**
 * 并行组节点控制器。
 *
 * 执行模型：
 * - 并行组也是主执行路径上的一步，内部包含多个子请求（parentId = 组节点 id 的 request node）
 * - 组内所有子请求同时用 Promise.all 发起
 * - 一错全停：任一子请求失败 → 取消其他 → 整组 FAILED
 * - 全部成功 → 组节点标记 SUCCESS → 主循环继续推进到下一个节点
 * - 子请求结果写入 flowContext[childStepId]，与普通 request 节点一致
 */
async function runParallelGroupStep({
  node,
  index,
  executionPath,
  nodes,
  edges,
  collection,
  collectionItems,
  runStore,
  cancelTokenUid,
  stopAtNodeId,
  baseRuntimeVariables,
  executed,
  flowContext
}) {
  const stepId = node.id;
  // 基础运行变量快照（组内所有子请求共享基础变量，但不互窜）
  const baseVars = { ...(collection.runtimeVariables || {}) };

  // 1. 查找组内所有子请求节点（parentId === stepId）
  const childNodes = nodes.filter((n) => n.parentId === stepId && n.type === 'request');
  if (childNodes.length === 0) {
    const error = '并行组内没有子请求节点';
    runStore.markMissing(stepId, error);
    return { kind: 'fail', index, error };
  }

  // 子请求由并行组控制器管理，不允许主循环再次进入
  childNodes.forEach((n) => executed.add(n.id));

  // 2. 并行执行所有子请求
  const childResults = await Promise.allSettled(
    childNodes.map((childNode) =>
      executeParallelChild({
        node: childNode,
        collection,
        collectionItems,
        runStore,
        flowContext,
        edges,
        baseRuntimeVariables,
        cancelTokenUid
      })
    )
  );

  // 3. 检查是否有取消
  const anyCancelled = childResults.some(
    (r) => r.status === 'fulfilled' && r.value?.type === 'cancelled'
  );
  if (anyCancelled) {
    return { kind: 'cancelled', index, stepId };
  }

  // 4. 检查是否全部成功
  const allSuccess = childResults.every(
    (r) => r.status === 'fulfilled' && r.value?.type === 'success'
  );

  if (allSuccess) {
    runStore.markSuccess(stepId, {
      duration: 0, // 并行组自身不记录耗时
      inputVariables: null
    });
    if (stopAtNodeId && stepId === stopAtNodeId) {
      return { kind: 'end', index, stoppedAt: stopAtNodeId };
    }
    return selectNextBranch({ stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext });
  }

  // 5. 有失败：一错全停
  const failedResult = childResults.find(
    (r) => r.status === 'fulfilled' && r.value?.type === 'stop'
  );
  const error = failedResult?.value?.error || '并行组内子请求执行失败';

  // 取消其他仍在运行的子请求
  runStore.setFlowStatus(FLOW_STATUS.FAILED);

  // 标记组节点失败
  runStore.markFailure(stepId, {
    error,
    inputVariables: null
  });

  // 剩余未失败的子节点标记为 skipped
  const failedStepIds = new Set();
  for (let i = 0; i < childResults.length; i++) {
    const r = childResults[i];
    if (r.status === 'fulfilled' && r.value?.type !== 'stop') continue;
    const failedChildNode = childResults[i]?.value?.stepId || childNodes[i]?.id;
    if (failedChildNode) failedStepIds.add(failedChildNode);
  }

  return { kind: 'fail', index, error };
}

/**
 * 执行并行组内的单个子请求。
 * 语义与 executeRequestNode 相同，但返回扁平结果（不经过分支选择/错误策略跳转）。
 */
async function executeParallelChild({
  node,
  collection,
  collectionItems,
  runStore,
  flowContext,
  edges,
  baseRuntimeVariables,
  cancelTokenUid
}) {
  const stepId = node.id;

  // 子请求可以引用主流程上游数据（位于并行组之前的节点结果）
  const item = collectionItems[node.requestUid];
  if (!item) {
    runStore.markMissing(stepId, `请求 ${node.requestUid} 不存在`);
    return { type: 'stop', stepId, error: `请求 ${node.requestUid} 不存在` };
  }

  runStore.markRunning(stepId);

  const { variables, errors: mappingErrors } = resolveInputMappings(
    node.inputs || [],
    { _nodeResults: flowContext, _edges: edges },
    stepId
  );

  if (mappingErrors.length > 0) {
    const errorMsg = mappingErrors.map((e) => `${e.variableName}: ${e.error}`).join('; ');
    runStore.markFailure(stepId, { error: `输入映射失败: ${errorMsg}`, inputVariables: variables });
    return { type: 'stop', stepId, error: `输入映射失败: ${errorMsg}` };
  }

  collection.runtimeVariables = { ...baseRuntimeVariables, ...variables };
  const environment = findEnvironmentInCollection(collection, collection.activeEnvironmentUid);

  const { response, requestError, duration, cancelled } = await sendStepRequest({
    item,
    collection,
    environment,
    runtimeVariables: collection.runtimeVariables,
    cancelTokenUid
  });

  if (cancelled) {
    return { type: 'cancelled', stepId };
  }

  if (requestError || response?.error) {
    const err = requestError ? (requestError.message || '网络请求失败') : response.error;
    runStore.markFailure(stepId, {
      error: err,
      body: response?.data || null,
      httpStatus: response?.status || null,
      duration: response?.duration ?? duration,
      inputVariables: variables,
      requestSent: sanitizeRequestSent(response?.requestSent)
    });
    return { type: 'stop', stepId, error: err };
  }

  // 断言检查
  const { results: assertionResults, failed: failedAssertions } = extractAssertionResults(response);
  if (failedAssertions.length > 0) {
    const assertError = `断言失败 (${assertionResults.length - failedAssertions.length}/${assertionResults.length} 通过): ${failedAssertions.map((a) => a.lhsExpr).join('; ')}`;
    runStore.markFailure(stepId, {
      error: assertError,
      body: response.data || null,
      httpStatus: response.status || null,
      duration: response.duration ?? duration,
      inputVariables: variables,
      requestSent: sanitizeRequestSent(response.requestSent),
      assertionResults
    });
    return { type: 'stop', stepId, error: assertError };
  }

  // 成功：写入 flowContext（key = 子请求自己的 stepId）
  flowContext[stepId] = {
    body: response.data,
    status: response.status,
    duration: response.duration ?? duration,
    headers: response.headers || null,
    statusText: response.statusText ?? null
  };
  runStore.markSuccess(stepId, {
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
  });
  return { type: 'success', stepId };
}

/**
 * 发送单个请求并识别取消。
 * 取消以 reject（消息含 cancel）或 resolve（isCancel 标记）两种形态出现。
 */
async function sendStepRequest({ item, collection, environment, runtimeVariables, cancelTokenUid }) {
  let response = null;
  let requestError = null;
  let duration = 0;
  try {
    const startTime = Date.now();
    response = await sendNetworkRequest(item, collection, environment, runtimeVariables, cancelTokenUid);
    duration = Date.now() - startTime;
  } catch (error) {
    if (isCancelledError(error)) {
      return { cancelled: true };
    }
    requestError = error;
  }

  if (response && isCancelledResponse(response)) {
    return { cancelled: true };
  }

  return { response, requestError, duration, cancelled: false };
}

/**
 * 统一错误策略：标记节点失败，按 stop/continue/jump 返回走向。
 *
 * continue 时在 flowContext 记录失败结果供出边条件引用（status 记为 0 表示无 HTTP 响应）。
 */
function applyErrorStrategy({
  node,
  stepId,
  runStore,
  flowContext,
  error,
  body,
  httpStatus,
  duration,
  requestSent,
  inputVariables,
  assertionResults
}) {
  runStore.markFailure(stepId, {
    body: body || null,
    httpStatus: httpStatus || null,
    duration: duration || null,
    error,
    inputVariables: inputVariables || null,
    requestSent: requestSent || null,
    assertionResults: assertionResults || null
  });

  const strategy = node?.errorHandler?.strategy || 'stop';
  if (strategy === 'continue') {
    flowContext[stepId] = {
      body: body || null,
      status: httpStatus || 0,
      duration: duration || 0,
      error
    };
    return { type: 'continue' };
  }

  if (strategy === 'jump' && node?.errorHandler?.jumpToNodeId) {
    return { type: 'jump', jumpToNodeId: node.errorHandler.jumpToNodeId };
  }

  return { type: 'stop', error };
}

/**
 * 错误策略结果 → 走向指令：
 * - stop → fail（跳过剩余节点）
 * - jump → 前向跳转 / 合流回退 / 不可达失败；stop-at 目标节点在此收尾
 * - continue → 交给分支选择（stop-at 同样在此收尾）
 */
function afterErrorOutcome(outcome, { stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext }) {
  if (outcome.type === 'stop') {
    return { kind: 'fail', index, error: outcome.error };
  }
  if (outcome.type === 'jump') {
    // 「运行到此节点」：目标节点以 jump 策略处理完失败即收尾，不再跳转
    if (stopAtNodeId && stepId === stopAtNodeId) {
      return { kind: 'end', index, stoppedAt: stopAtNodeId };
    }
    const targetIndex = executionPath.findIndex((s) => s.stepId === outcome.jumpToNodeId);
    if (targetIndex > index) {
      return { kind: 'goto', index: advanceSkipping(executionPath, index, targetIndex, runStore) };
    }
    if (targetIndex >= 0 && !executed.has(outcome.jumpToNodeId)) {
      // 合流回退：目标此前被跳过（另一分支未走到），恢复执行
      runStore.resetNode(outcome.jumpToNodeId);
      return { kind: 'goto', index: targetIndex };
    }
    return { kind: 'fail', index, error: `jump 目标不可达：${outcome.jumpToNodeId}` };
  }
  // continue → 走分支选择（响应数据已在 flowContext，条件仍可引用）
  return selectNextBranch({ stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext });
}

/**
 * 推进到前向目标，途中节点标记为 skipped。
 */
function advanceSkipping(executionPath, fromIndex, targetIndex, runStore) {
  const between = executionPath.slice(fromIndex + 1, targetIndex).map((s) => s.stepId);
  runStore.skipNodes(between);
  return targetIndex;
}

/**
 * 分支选择：评估出边条件，返回走向指令。
 * 「运行到此节点」在本函数入口收尾——成功与 continue 两条到达路径统一覆盖。
 *
 * 合流语义：选中的目标若在线性路径中位于当前位置之前、且从未真正执行过
 * （只是被 advanceSkipping 标记 skipped），恢复其状态并回退执行；
 * 已执行过则判定为真回跳，流程失败。
 */
function selectNextBranch({ stepId, node, index, executionPath, edges, runStore, executed, stopAtNodeId, flowContext }) {
  if (stopAtNodeId && stepId === stopAtNodeId) {
    return { kind: 'end', index, stoppedAt: stopAtNodeId };
  }

  const outgoingEdges = (edges || []).filter((e) => e.source === stepId);
  const selectedEdge = selectBranch(outgoingEdges, flowContext);
  if (selectedEdge) {
    if (selectedEdge.target === 'end') {
      return { kind: 'end', index };
    }
    const targetIndex = executionPath.findIndex((s) => s.stepId === selectedEdge.target);
    if (targetIndex > index) {
      return { kind: 'goto', index: advanceSkipping(executionPath, index, targetIndex, runStore) };
    }
    if (targetIndex >= 0) {
      if (!executed.has(selectedEdge.target)) {
        runStore.resetNode(selectedEdge.target);
        return { kind: 'goto', index: targetIndex };
      }
      return { kind: 'fail', index, error: `检测到回跳：节点 ${selectedEdge.target} 已执行过` };
    }
    return { kind: 'fail', index, error: `分支目标 ${selectedEdge.target} 不在执行路径上` };
  }

  if (outgoingEdges.length === 0) {
    return { kind: 'fail', index, error: `节点 ${node.alias || stepId} 没有连接到下游节点` };
  }
  // 无可满足的分支且无默认边：流程终止为失败，而不是误报成功
  return { kind: 'fail', index, error: `节点 ${node.alias || stepId} 没有可满足的出边条件，流程终止` };
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
  const { variables, errors: mappingErrors } = resolveInputMappings(
    node.inputs || [],
    { _nodeResults: flowContext, _edges: edges },
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

  const { response, cancelled, duration } = await sendStepRequest({
    item: itemWithDraft,
    collection,
    environment,
    runtimeVariables: collection.runtimeVariables,
    cancelTokenUid
  });

  if (cancelled) {
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
