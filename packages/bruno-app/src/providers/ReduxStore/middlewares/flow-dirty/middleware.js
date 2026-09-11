/**
 * flowDirtyMiddleware
 *
 * 维护 Flow 图的脏标记：
 * - 图编辑 action（8 个 flow reducer）→ 标脏；
 * - saveFlow / newFlow 成功（flowSaved）→ 重建基准、清脏；
 * - 集合装载/挂载/文件事件（createCollection、collectionLoadedFromTree、
 *   collectionAddFileEvent）→ 为尚无基准的 Flow 建立磁盘基准；树重建后
 *   干净的 Flow 重新对齐磁盘版本；
 * - reducer 在脏状态下保留了内存图时，把外部变更标记转成 UI 提示。
 *
 * 注意：必须在 next(action) 之后读取状态（reducer 已应用）。
 */
import {
  setFlowDirty,
  clearFlowDirty,
  setFlowExternalChange,
  clearFlowExternalChange
} from 'providers/ReduxStore/slices/flowEditor';
import {
  setFlowSnapshot,
  hasFlowSnapshot,
  isFlowDirty,
  markFlowDirty,
  consumeFlowExternalChange
} from 'utils/flow/dirty-registry';
import { findItemInCollection } from 'utils/collections';

// 直接改写 flow 图的 reducer actions（payload 均含 itemUid）
const FLOW_GRAPH_ACTIONS = new Set([
  'collections/updateFlowNodes',
  'collections/updateFlowEdges',
  'collections/updateFlowNode',
  'collections/addFlowNode',
  'collections/removeFlowNode',
  'collections/addFlowEdge',
  'collections/removeFlowEdge',
  'collections/updateFlowNodeInputs'
]);

function collectFlowItems(items, result = []) {
  for (const item of items || []) {
    if (!item) continue;
    if (item.type === 'flow' && item.flow) {
      result.push(item);
    }
    if (item.items) {
      collectFlowItems(item.items, result);
    }
  }
  return result;
}

export const flowDirtyMiddleware = ({ getState, dispatch }) => (next) => (action) => {
  const result = next(action);
  const type = action.type;
  const flowUid = action.payload?.itemUid || action.payload?.flowUid;

  // saveFlow / newFlow 成功：以当前内存图建立基准
  if (type === 'flowEditor/flowSaved' && flowUid) {
    const state = getState();
    const collection = (state.collections.collections || []).find(
      (c) => c.uid === action.payload.collectionUid
    );
    const item = collection ? findItemInCollection(collection, flowUid) : null;
    if (item?.flow) {
      setFlowSnapshot(flowUid, item.flow);
    }
    consumeFlowExternalChange(flowUid);
    dispatch(clearFlowDirty({ flowUid }));
    dispatch(clearFlowExternalChange({ flowUid }));
    return result;
  }

  // 图编辑 → 标脏
  if (FLOW_GRAPH_ACTIONS.has(type) && flowUid) {
    markFlowDirty(flowUid);
    if (isFlowDirty(flowUid)) {
      dispatch(setFlowDirty({ flowUid }));
    }
    return result;
  }

  // 集合装载（启动加载 / 新建集合）：为其中尚无基准的 Flow 建立磁盘基准
  if (type === 'collections/createCollection') {
    const flows = collectFlowItems(action.payload?.items);
    for (const flow of flows) {
      if (!hasFlowSnapshot(flow.uid)) {
        setFlowSnapshot(flow.uid, flow.flow);
      }
    }
    return result;
  }

  // 文件 watcher 树重建：干净的 Flow 重新对齐磁盘版本
  if (type === 'collections/collectionLoadedFromTree') {
    const collectionUid = action.payload?.collectionUid;
    const state = getState();
    const collection = (state.collections.collections || []).find((c) => c.uid === collectionUid);
    const flows = collection ? collectFlowItems(collection.items) : [];
    for (const flow of flows) {
      // 脏图被 reducer 保护保留，不打外部变更标记的（本轮无覆盖）不重新对齐
      if (!isFlowDirty(flow.uid)) {
        setFlowSnapshot(flow.uid, flow.flow);
      } else if (consumeFlowExternalChange(flow.uid)) {
        dispatch(setFlowExternalChange({ flowUid: flow.uid }));
      }
    }
    return result;
  }

  // 文件事件（含 flow.yml 外部编辑覆盖分支）：确保新装载的 Flow 有基准
  if (type === 'collections/collectionAddFileEvent' || type === 'collections/collectionChangeFileEvent') {
    const collectionUid = action.payload?.file?.meta?.collectionUid;
    if (collectionUid) {
      const state = getState();
      const collection = (state.collections.collections || []).find((c) => c.uid === collectionUid);
      const flows = collection ? collectFlowItems(collection.items) : [];
      for (const flow of flows) {
        if (!hasFlowSnapshot(flow.uid) && !isFlowDirty(flow.uid)) {
          setFlowSnapshot(flow.uid, flow.flow);
        } else if (consumeFlowExternalChange(flow.uid)) {
          dispatch(setFlowExternalChange({ flowUid: flow.uid }));
        }
      }
    }
    return result;
  }

  return result;
};
