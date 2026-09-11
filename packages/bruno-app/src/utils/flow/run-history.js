/**
 * Flow 运行历史
 *
 * 每次整链运行（含运行到此）结束构建一条运行记录，持久化到应用数据目录
 * （不进集合目录，避免污染 git），每 Flow 保留最近 RUN_HISTORY_LIMIT 次。
 * 单跑节点不产生历史记录。
 *
 * 响应体超过 RUN_HISTORY_MAX_BODY 截断为纯文本并保持可回看（dataBuffer 超限置空）。
 */
import { FLOW_STATUS } from 'providers/ReduxStore/slices/flowRun';

export const RUN_HISTORY_LIMIT = 20;
export const RUN_HISTORY_MAX_BODY = 1024 * 1024; // 1MB

const truncateBody = (body) => {
  if (body === null || body === undefined) return body;
  let str;
  try {
    str = typeof body === 'string' ? body : JSON.stringify(body);
  } catch {
    return String(body);
  }
  if (!str || str.length <= RUN_HISTORY_MAX_BODY) {
    return body;
  }
  // 超限截断为纯文本（QueryResult 会按文本渲染）
  return str.slice(0, RUN_HISTORY_MAX_BODY);
};

const truncateNodeState = (nodeState) => {
  if (!nodeState) return nodeState;
  const cloned = { ...nodeState };
  cloned.body = truncateBody(cloned.body);
  if (cloned.dataBuffer && String(cloned.dataBuffer).length > RUN_HISTORY_MAX_BODY) {
    cloned.dataBuffer = null;
  }
  return cloned;
};

/**
 * 从 flowRun slice 的运行态构建一条历史记录。
 *
 * @param {Object} options
 * @param {string} options.flowUid
 * @param {string} options.collectionUid
 * @param {Object} options.runState flowRun.runs[flowUid] 运行态
 * @param {number} options.startedAt 本次运行开始时间戳
 * @param {'full' | 'stop-at'} options.trigger 触发方式
 * @param {string|null} [options.stopAtNodeId] 运行到此节点为止时的目标节点
 * @param {'success' | 'failed' | 'cancelled'} options.status 运行结果
 * @returns {Object} 运行记录
 */
export function buildRunRecord({ flowUid, collectionUid, runState, startedAt, trigger, stopAtNodeId, status }) {
  const finishedAt = Date.now();
  const nodes = {};
  for (const [stepId, nodeState] of Object.entries(runState?.nodes || {})) {
    nodes[stepId] = truncateNodeState(nodeState);
  }

  return {
    runId: runState?.flowRunId || `${startedAt}`,
    flowUid,
    collectionUid,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt),
    trigger: trigger || 'full',
    stopAtNodeId: stopAtNodeId || null,
    status: status || (runState?.status === FLOW_STATUS.CANCELLED ? 'cancelled' : 'failed'),
    nodes
  };
}

const hasIpc = () => typeof window !== 'undefined' && window.ipcRenderer;

/** 保存运行记录（fire-and-forget 语义：失败静默，不影响运行流程） */
export async function saveFlowRunRecord(record) {
  if (!hasIpc()) return false;
  try {
    await window.ipcRenderer.invoke('flow-history:save', record);
    return true;
  } catch (err) {
    console.warn('[flow-history] 保存运行记录失败', err);
    return false;
  }
}

/** 列出某 Flow 的历史记录元信息（不含响应体，按时间倒序） */
export async function listFlowRunRecords(collectionUid, flowUid) {
  if (!hasIpc()) return [];
  try {
    return (await window.ipcRenderer.invoke('flow-history:list', { collectionUid, flowUid })) || [];
  } catch (err) {
    console.warn('[flow-history] 读取历史列表失败', err);
    return [];
  }
}

/** 读取某次运行的完整记录 */
export async function loadFlowRunRecord(collectionUid, flowUid, runId) {
  if (!hasIpc()) return null;
  try {
    return await window.ipcRenderer.invoke('flow-history:load', { collectionUid, flowUid, runId });
  } catch (err) {
    console.warn('[flow-history] 读取运行记录失败', err);
    return null;
  }
}

/** 清空某 Flow 的全部历史 */
export async function clearFlowRunRecords(collectionUid, flowUid) {
  if (!hasIpc()) return false;
  try {
    await window.ipcRenderer.invoke('flow-history:clear', { collectionUid, flowUid });
    return true;
  } catch (err) {
    console.warn('[flow-history] 清空历史失败', err);
    return false;
  }
}
