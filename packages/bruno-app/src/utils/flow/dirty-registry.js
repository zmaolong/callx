/**
 * Flow 图脏标记注册表
 *
 * 模块级 Map（有意脱离 Redux）：
 * - 作为"最近一次保存/加载的图快照"基准，供丢弃修改、树重建冲突保护使用；
 * - collections reducer（mergeTreeItems / collectionChangeFileEvent）无法访问
 *   其他 slice，直接读模块注册表是最小侵入方案；
 * - 响应式 UI 状态（顶栏脏点、外部变更提示）由 flowEditor slice 承载，
 *   本注册表与 slice 由 flowDirtyMiddleware 同步维护。
 *
 * 快照比较使用 JSON.stringify({nodes, edges})：节点/边对象在 reducer 中均以
 * 展开方式更新，键序稳定，序列化比较在此规模（几十个节点）开销可忽略。
 */

const snapshots = new Map(); // flowUid → JSON 字符串
const dirtyFlags = new Map(); // flowUid → boolean
const externalChangeFlags = new Set();

const serialize = (graph) =>
  JSON.stringify({
    nodes: graph?.nodes || [],
    edges: graph?.edges || []
  });

/** 以当前图建立基准（磁盘加载 / 保存成功 / 新建落盘后调用） */
export function setFlowSnapshot(flowUid, graph) {
  if (!flowUid) return;
  snapshots.set(flowUid, serialize(graph));
  dirtyFlags.set(flowUid, false);
}

export function hasFlowSnapshot(flowUid) {
  return snapshots.has(flowUid);
}

export function isFlowDirty(flowUid) {
  return dirtyFlags.get(flowUid) === true;
}

/** 标记脏；无基准时不标记（从未加载过磁盘状态的 Flow 不参与脏跟踪） */
export function markFlowDirty(flowUid) {
  if (!flowUid || !snapshots.has(flowUid)) return;
  dirtyFlags.set(flowUid, true);
}

/** 取基准快照（深拷贝返回，供"放弃修改"还原） */
export function getFlowSnapshot(flowUid) {
  const raw = snapshots.get(flowUid);
  if (raw === undefined) return null;
  return JSON.parse(raw);
}

/** 丢弃记录（Flow 被删除 / 应用退出时调用） */
export function discardFlowRecord(flowUid) {
  snapshots.delete(flowUid);
  dirtyFlags.delete(flowUid);
  externalChangeFlags.delete(flowUid);
}

/** 树重建/文件事件在脏状态下保留内存图时打标，由中间件转成 UI 提示 */
export function markFlowExternalChange(flowUid) {
  if (!flowUid) return;
  externalChangeFlags.add(flowUid);
}

/** 读取并清除外部变更标记 */
export function consumeFlowExternalChange(flowUid) {
  if (!flowUid || !externalChangeFlags.has(flowUid)) return false;
  externalChangeFlags.delete(flowUid);
  return true;
}
