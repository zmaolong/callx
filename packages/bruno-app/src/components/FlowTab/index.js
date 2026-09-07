import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import FlowCanvas from './FlowCanvas';
import FlowSidebar from './FlowSidebar';
import StyledWrapper from './StyledWrapper';
import { reconcileFlowNodes, removeOrphanedNodes } from 'utils/flow/reconcile';
import { findItemInCollection, findCollectionByItemUid } from 'utils/collections';
import { validateGraph } from 'utils/flow/graph';
import {
  addFlowNode,
  removeFlowNode,
  updateFlowNode,
  updateFlowNodes
} from 'providers/ReduxStore/slices/collections';
import { deleteItem, cloneItem } from 'providers/ReduxStore/slices/collections/actions';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { sanitizeName } from 'utils/common/regex';
import { executeFlow, cancelFlow } from 'utils/flow/executor';
import { clearFlowRunState } from 'providers/ReduxStore/slices/flowRun';
import Modal from 'components/Modal';

const FlowTab = ({ flow }) => {
  const dispatch = useDispatch();
  const [selectedNode, setSelectedNode] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const flowRun = useSelector((state) => state.flowRun?.runs?.[flow?.uid]);
  const collections = useSelector((state) => state.collections.collections);

  // 使用 useMemo 缓存集合查找结果，避免每次 Redux 状态变化都重建所有扁平化数组
  const collection = useMemo(() => {
    if (!flow) return null;
    return findCollectionByItemUid(collections, flow.uid);
  }, [collections, flow?.uid]);

  const collectionUid = collection?.uid;

  // 挂载时执行 reconcile
  useEffect(() => {
    if (!flow || !collection) return;

    const flowNodes = flow.flow?.nodes || [];
    const flowEdges = flow.flow?.edges || [];

    // 收集 Flow 目录中的请求文件
    const requestItems = (flow.items || []).filter(
      (item) => item.request && ['http-request', 'graphql-request'].includes(item.type)
    );

    // 补建缺失节点
    const newNodes = reconcileFlowNodes(flowNodes, requestItems);
    for (const node of newNodes) {
      dispatch(addFlowNode({ collectionUid: collection.uid, itemUid: flow.uid, node }));
    }

    // 移除孤儿节点
    const { nodes: keptNodes, edges: keptEdges } = removeOrphanedNodes(flowNodes, flowEdges, requestItems);
    const removedNodes = flowNodes.filter((n) => !keptNodes.find((kn) => kn.id === n.id));
    for (const node of removedNodes) {
      dispatch(removeFlowNode({ collectionUid: collection.uid, itemUid: flow.uid, nodeId: node.id }));
    }
  }, [flow?.uid, collection?.uid]);

  // 校验
  const handleValidate = useCallback(() => {
    if (!flow?.flow) return [];
    const validationErrors = validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
    return validationErrors;
  }, [flow?.flow]);

  // 运行
  const handleRun = useCallback(async () => {
    const validationErrors = handleValidate();
    if (validationErrors && validationErrors.length > 0) return;

    if (!flow || !collection || !flow.flow) return;

    setIsRunning(true);

    // 构建 collectionItems 映射
    const collectionItems = {};
    const flattenItems = (items) => {
      for (const item of items) {
        if (item.uid) {
          collectionItems[item.uid] = item;
        }
        if (item.items) flattenItems(item.items);
      }
    };
    flattenItems(flow.items || []);
    // 也搜索集合中的顶层
    if (collection.items) flattenItems(collection.items);

    const collectionCopy = JSON.parse(JSON.stringify(collection));

    await executeFlow({
      flowUid: flow.uid,
      collectionUid: collection.uid,
      flow: flow.flow,
      collection: collectionCopy,
      collectionItems,
      dispatch,
      getState: () => ({}) // 简化版，实际执行器从 Redux 读取 flowRun 状态
    });

    setIsRunning(false);
  }, [handleValidate, flow, collection, dispatch]);

  // 取消
  const handleCancel = useCallback(() => {
    dispatch(cancelFlow(flow?.uid, null, dispatch));
    setIsRunning(false);
  }, [flow?.uid, dispatch]);

  // 清理运行态
  useEffect(() => {
    return () => {
      if (flow?.uid) {
        dispatch(clearFlowRunState({ flowUid: flow.uid }));
      }
    };
  }, [flow?.uid, dispatch]);

  // 校验错误（从 flowRun 状态和 Graph 校验获取）
  const errors = useCallback(() => {
    if (!flow?.flow) return [];
    return validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
  }, [flow?.flow]);

  // 自动布局（简单分层）
  const handleAutoLayout = useCallback(() => {
    if (!flow?.flow?.nodes) return;
    const nodes = flow.flow.nodes;
    const edges = flow.flow.edges || [];

    const cUid = collectionUid;
    const fUid = flow.uid;

    // 延迟执行，让 UI 先响应点击反馈，避免布局计算和 Redux 更新链阻塞主线程
    setTimeout(() => {
      // 从 Start 出发 BFS 计算层级
      const levels = {};
      const queue = [{ id: 'start', level: 0 }];
      const visited = new Set();

      while (queue.length > 0) {
        const { id, level } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        levels[id] = level;

        const outEdges = edges.filter((e) => e.source === id);
        for (const edge of outEdges) {
          queue.push({ id: edge.target, level: level + 1 });
        }
      }

      // 未连接节点放在最右边
      let maxLevel = Math.max(...Object.values(levels), 0);
      const updatedNodes = nodes.map((node) => {
        let level = levels[node.id];
        if (level === undefined) {
          maxLevel += 1;
          level = maxLevel;
        }
        return {
          ...node,
          position: { x: 80 + level * 280, y: 100 + node.position.y * 0 }
        };
      });

      // 垂直微调：同一层级分散
      const levelCounts = {};
      for (const node of updatedNodes) {
        const level = levels[node.id] || maxLevel;
        levelCounts[level] = (levelCounts[level] || 0) + 1;
      }
      const levelIndex = {};
      for (const node of updatedNodes) {
        const level = levels[node.id] || maxLevel;
        levelIndex[level] = (levelIndex[level] || 0) + 1;
        const count = levelCounts[level];
        const idx = levelIndex[level];
        node.position.y = 200 + (idx - count / 2) * 120;
      }

      dispatch(updateFlowNodes({
        collectionUid: cUid,
        itemUid: fUid,
        nodes: updatedNodes
      }));
    }, 50);
  }, [flow?.flow, collectionUid, flow?.uid]);

  // 更新节点
  const handleUpdateNode = useCallback((nodeId, updates) => {
    dispatch(updateFlowNode({
      collectionUid,
      itemUid: flow.uid,
      nodeId,
      updates
    }));
  }, [collectionUid, flow?.uid]);

  // 编辑请求
  const handleEditRequest = useCallback((nodeData) => {
    const requestUid = nodeData?.requestUid;
    if (!requestUid || !collection) return;
    const item = findItemInCollection(collection, requestUid);
    if (!item) return;
    dispatch(addTab({
      uid: item.uid,
      collectionUid: collection.uid,
      type: item.type,
      pathname: item.pathname
    }));
  }, [collection, dispatch]);

  // 删除请求
  const handleDeleteRequest = useCallback((nodeData) => {
    const requestUid = nodeData?.requestUid;
    if (!requestUid || !collectionUid) return;
    setDeleteTarget(nodeData);
  }, [collectionUid]);

  // 确认删除
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const requestUid = deleteTarget?.requestUid;
    if (!requestUid || !collectionUid) return;
    try {
      await dispatch(deleteItem(requestUid, collectionUid));
    } catch (error) {
      console.error('Error deleting flow request:', error);
    }
    setDeleteTarget(null);
  }, [deleteTarget, collectionUid, dispatch]);

  // 复制请求
  const handleDuplicateRequest = useCallback((nodeData) => {
    const requestUid = nodeData?.requestUid;
    if (!requestUid || !collectionUid) return;
    const item = findItemInCollection(collection, requestUid);
    if (!item) return;
    const newName = `${item.name} copy`;
    const newFilename = sanitizeName(newName);
    dispatch(cloneItem(newName, newFilename, requestUid, collectionUid));
  }, [collection, collectionUid, dispatch]);

  return (
    <StyledWrapper className="flex flex-col flex-grow">
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <div style={{ flexGrow: 1, position: 'relative' }}>
          <FlowCanvas
            flow={flow}
            collectionUid={collectionUid}
            onSelectNode={setSelectedNode}
            toolbarProps={{
              onRun: handleRun,
              onCancel: handleCancel,
              onAutoLayout: handleAutoLayout,
              isRunning,
              errors
            }}
          />
        </div>
        <FlowSidebar
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onEditRequest={handleEditRequest}
          onDeleteRequest={handleDeleteRequest}
          onDuplicateRequest={handleDuplicateRequest}
        />
      </div>

      {deleteTarget && (
        <Modal
          size="md"
          title="删除请求"
          confirmText="Delete"
          confirmButtonColor="danger"
          handleConfirm={handleConfirmDelete}
          handleCancel={() => setDeleteTarget(null)}
        >
          确定要删除 <span className="font-medium">{deleteTarget?.alias || deleteTarget?.label || '此请求'}</span> 吗？
        </Modal>
      )}
    </StyledWrapper>
  );
};

export default React.memo(FlowTab, (prev, next) => prev.flow?.uid === next.flow?.uid);
