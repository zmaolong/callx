/**
 * useFlowReconcile — Flow 目录请求与画布节点的自动协调。
 *
 * 递归收集 Flow 目录（含子文件夹）中的请求文件，以 uid 签名检测增删：
 * - 新增请求 → 补建未连接节点；
 * - 删除请求 → 移除孤儿节点及其关联边；
 * - 重启后 uid 变化 → 按 requestPath/alias 回退匹配并更新 requestUid。
 *
 * 签名进入 effect 依赖：Tab 打开期间目录变化也会触发（此前仅挂载时执行一次）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { reconcileFlowNodes, removeOrphanedNodes } from 'utils/flow/reconcile';
import {
  addFlowNode,
  removeFlowNode,
  updateFlowNode
} from 'providers/ReduxStore/slices/collections';

const REQUEST_TYPES = ['http-request', 'graphql-request'];

export function useFlowReconcile(flow, collection) {
  const dispatch = useDispatch();

  // Flow 目录中的请求文件（含子文件夹，递归收集）——reconcile 的比对基准
  const requestItems = useMemo(() => {
    const found = [];
    const walk = (items) => {
      for (const item of items || []) {
        if (item.request && REQUEST_TYPES.includes(item.type)) {
          found.push(item);
        }
        if (item.items) walk(item.items);
      }
    };
    walk(flow?.items);
    return found;
  }, [flow?.items]);

  // 请求 uid 签名：新增/删除请求文件时触发 reconcile
  const requestSignature = useMemo(
    () => requestItems.map((r) => r.uid).sort().join(','),
    [requestItems]
  );

  const prevRequestUidSignature = useRef('');

  useEffect(() => {
    if (!flow || !collection) return;

    const flowNodes = flow.flow?.nodes || [];
    const flowEdges = flow.flow?.edges || [];

    // 如果请求 uid 签名未变化，跳过 reconcile 避免循环
    if (requestSignature === prevRequestUidSignature.current) {
      return;
    }
    prevRequestUidSignature.current = requestSignature;

    const itemsEmpty = requestItems.length === 0;

    if (!itemsEmpty) {
      // 补建缺失节点
      const newNodes = reconcileFlowNodes(flowNodes, requestItems);
      for (const node of newNodes) {
        dispatch(addFlowNode({ collectionUid: collection.uid, itemUid: flow.uid, node }));
      }
    }

    // 移除孤儿节点（仅当 items 有数据时才清理，避免启动期误删）
    if (!itemsEmpty) {
      const { nodes: keptNodes, nodesToUpdateUid } = removeOrphanedNodes(flowNodes, flowEdges, requestItems);
      const removedNodes = flowNodes.filter((n) => !keptNodes.find((kn) => kn.id === n.id));
      for (const node of removedNodes) {
        dispatch(removeFlowNode({ collectionUid: collection.uid, itemUid: flow.uid, nodeId: node.id }));
      }
      // 更新重启后 uid 变化的节点（requestUid 按 requestPath 重新匹配）
      for (const { nodeId, newUid } of nodesToUpdateUid) {
        dispatch(updateFlowNode({
          collectionUid: collection.uid,
          itemUid: flow.uid,
          nodeId,
          updates: { requestUid: newUid }
        }));
      }
    }
    // flow/collection 以 uid 进依赖：签名变化时闭包已是最新渲染值，
    // 图数据本身的更新（拖拽/编辑）不应触发 effect 空跑
  }, [requestSignature, flow?.uid, collection?.uid]);
}

export default useFlowReconcile;
