import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import FlowCanvas from './FlowCanvas';
import FlowSidebar from './FlowSidebar';
import FlowRunPanel from './FlowRunPanel';
import StyledWrapper from './StyledWrapper';
import { reconcileFlowNodes, removeOrphanedNodes } from 'utils/flow/reconcile';
import { findItemInCollection, findCollectionByItemUid } from 'utils/collections';
import { validateGraph } from 'utils/flow/graph';
import {
  addFlowNode,
  removeFlowNode,
  updateFlowNode,
  updateFlowNodeInputs,
  updateFlowNodes
} from 'providers/ReduxStore/slices/collections';
import { deleteItem, cloneItem, saveFlow } from 'providers/ReduxStore/slices/collections/actions';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { sanitizeName } from 'utils/common/regex';
import { executeFlow, cancelFlow } from 'utils/flow/executor';
import { clearFlowRunState } from 'providers/ReduxStore/slices/flowRun';
import Modal from 'components/Modal';
import toast from 'react-hot-toast';

const FlowTab = ({ flow }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
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

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = flow?.flow?.nodes?.find((candidate) => candidate.id === selectedNodeId);
    if (!node) return null;

    return {
      id: node.id,
      type: node.type,
      data: node
    };
  }, [flow?.flow?.nodes, selectedNodeId]);

  // 用 ref 跟踪请求 uid 签名，检测是否有新增或删除
  const prevRequestUidSignature = useRef('');

  // 挂载时以及 Flow 目录请求变化时执行 reconcile
  useEffect(() => {
    if (!flow || !collection) return;

    const flowNodes = flow.flow?.nodes || [];
    const flowEdges = flow.flow?.edges || [];

    // 收集 Flow 目录中的请求文件
    const requestItems = (flow.items || []).filter(
      (item) => item.request && ['http-request', 'graphql-request'].includes(item.type)
    );

    // 如果请求 uid 签名未变化，跳过 reconcile 避免循环
    const currentSignature = requestItems.map((r) => r.uid).sort().join(',');
    if (currentSignature === prevRequestUidSignature.current) {
      return;
    }
    prevRequestUidSignature.current = currentSignature;

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
    if (validationErrors && validationErrors.length > 0) {
      toast.error(`校验失败：${validationErrors.map((e) => e.message).join('；')}`);
      return;
    }

    if (!flow || !collection || !flow.flow) {
      toast.error('Flow 数据不完整，无法运行');
      return;
    }

    // 检查是否有从 Start 出发的连线
    const hasStartEdge = flow.flow.edges?.some((e) => e.source === 'start');
    if (!hasStartEdge) {
      toast.error('没有可执行的节点，请先连接 Start 到请求节点');
      return;
    }

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

    try {
      const result = await executeFlow({
        flowUid: flow.uid,
        collectionUid: collection.uid,
        flow: flow.flow,
        collection: collectionCopy,
        collectionItems,
        dispatch,
        getState: store.getState
      });
      if (result && !result.success) {
        toast.error(result.error || 'Flow 执行失败');
      }
    } finally {
      setIsRunning(false);
    }
  }, [handleValidate, flow, collection, dispatch, store]);

  // 取消
  const handleCancel = useCallback(() => {
    cancelFlow(flow?.uid, null, dispatch, store.getState);
    setIsRunning(false);
  }, [flow?.uid, dispatch, store]);

  // 清理运行态
  useEffect(() => {
    return () => {
      if (flow?.uid) {
        dispatch(clearFlowRunState({ flowUid: flow.uid }));
      }
    };
  }, [flow?.uid, dispatch]);

  // 校验错误（从 flowRun 状态和 Graph 校验获取）
  const errors = useMemo(() => {
    if (!flow?.flow) return [];
    return validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
  }, [flow?.flow]);

  // 自动布局（简单分层，固定 Start/End 位置）
  const handleAutoLayout = useCallback(() => {
    if (!flow?.flow?.nodes) return;
    const nodes = flow.flow.nodes;
    const edges = flow.flow.edges || [];

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
    const unconnectedCount = nodes.filter((n) => levels[n.id] === undefined && n.type !== 'start' && n.type !== 'end').length;

    const updatedNodes = nodes.map((node) => {
      if (node.type === 'start') {
        return { ...node, position: { x: 80, y: 200 } };
      }
      if (node.type === 'end') {
        const endLevel = maxLevel + 1 + unconnectedCount;
        return { ...node, position: { x: 80 + endLevel * 280, y: 200 } };
      }

      let level = levels[node.id];
      if (level === undefined) {
        maxLevel += 1;
        level = maxLevel;
      }
      return {
        ...node,
        position: { ...node.position, x: 80 + level * 280 }
      };
    });

    // 垂直微调：同一层级分散，固定在稳定的 Y 位置
    const levelCounts = {};
    for (const node of updatedNodes) {
      if (node.type === 'start' || node.type === 'end') continue;
      const level = levels[node.id] || 0;
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    }
    const levelIndex = {};
    for (const node of updatedNodes) {
      if (node.type === 'start' || node.type === 'end') continue;
      const level = levels[node.id] || 0;
      levelIndex[level] = (levelIndex[level] || 0) + 1;
      const count = levelCounts[level];
      const idx = levelIndex[level];
      node.position.y = 200 + (idx - count / 2) * 120;
    }

    dispatch(updateFlowNodes({
      collectionUid,
      itemUid: flow.uid,
      nodes: updatedNodes
    }));
  }, [flow?.flow, collectionUid, flow?.uid]);

  // 更新节点（别名等修改 → 即时更新 Redux，防抖持久化到磁盘）
  const debouncedSaveRef = useRef(null);
  const handleUpdateNode = useCallback((nodeId, updates) => {
    dispatch(updateFlowNode({
      collectionUid,
      itemUid: flow.uid,
      nodeId,
      updates
    }));

    // 防抖持久化：300ms 内连续触发只保存最后一次
    if (debouncedSaveRef.current) {
      clearTimeout(debouncedSaveRef.current);
    }
    debouncedSaveRef.current = setTimeout(() => {
      dispatch(saveFlow(flow.uid, collectionUid));
    }, 300);
  }, [collectionUid, flow?.uid, dispatch]);

  // 组件卸载时清除防抖定时器
  useEffect(() => {
    return () => {
      if (debouncedSaveRef.current) {
        clearTimeout(debouncedSaveRef.current);
      }
    };
  }, []);

  const handleUpdateNodeInputs = useCallback((nodeId, inputs) => {
    dispatch(updateFlowNodeInputs({
      collectionUid,
      itemUid: flow.uid,
      nodeId,
      inputs
    }));
    return dispatch(saveFlow(flow.uid, collectionUid));
  }, [collectionUid, flow?.uid, dispatch]);

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
        <div style={{ flexGrow: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flexGrow: 1, position: 'relative' }}>
            <FlowCanvas
              flow={flow}
              collectionUid={collectionUid}
              onSelectNode={(node) => setSelectedNodeId(node ? node.id : null)}
              toolbarProps={{
                onRun: handleRun,
                onCancel: handleCancel,
                onAutoLayout: handleAutoLayout,
                isRunning,
                errors
              }}
            />
          </div>
          <FlowRunPanel
            flowRun={flowRun}
            nodes={flow?.flow?.nodes}
            isRunning={isRunning}
          />
        </div>
        <FlowSidebar
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onUpdateInputs={handleUpdateNodeInputs}
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

export default FlowTab;
