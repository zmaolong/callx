/**
 * useFlowGraphActions — 画布图编辑动作集合。
 *
 * 右键菜单动作（增删节点/边、编辑/复制/删除请求）、边条件保存、
 * 一键映射下游（QuickMap）、自动布局、节点配置更新与撤销快照接线。
 */
import { useCallback, useState } from 'react';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  addFlowNode,
  addFlowEdge,
  removeFlowNode,
  removeFlowEdge,
  updateFlowNode,
  updateFlowNodeInputs,
  updateFlowNodes,
  updateFlowEdges
} from 'providers/ReduxStore/slices/collections';
import { deleteItem, cloneItem } from 'providers/ReduxStore/slices/collections/actions';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { sanitizeName } from 'utils/common/regex';
import { findItemInCollection } from 'utils/collections';
import { generateNodeStepId } from 'utils/flow/graph';

export function useFlowGraphActions({
  flow,
  collection,
  collectionUid,
  requestInfoMap,
  takeSnapshot,
  setSelectedNodeId
}) {
  const dispatch = useDispatch();

  // 正在配置条件的边（右键菜单「配置条件」打开弹窗）
  const [conditionEdge, setConditionEdge] = useState(null);
  // 删除请求确认弹窗目标
  const [deleteTarget, setDeleteTarget] = useState(null);
  // 快速映射多下游目标选择弹窗（{ sourceStepId, targets }）
  const [quickMapTargets, setQuickMapTargets] = useState(null);

  // 编辑请求（跳转到标准请求 Tab；请求编辑器后续将内嵌工作台，此入口保留兜底）
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

  // 删除请求（打开确认弹窗）
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

  // 右键菜单回调
  const handleContextMenuAction = useCallback((type, payload) => {
    switch (type) {
      case 'edit': {
        handleEditRequest(payload.data);
        break;
      }
      case 'duplicate': {
        handleDuplicateRequest(payload.data);
        break;
      }
      case 'deleteNode': {
        const nodeId = payload.id;
        takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
        dispatch(removeFlowNode({ collectionUid, itemUid: flow.uid, nodeId }));
        break;
      }
      case 'deleteEdge': {
        const edgeId = payload.id;
        takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
        dispatch(removeFlowEdge({ collectionUid, itemUid: flow.uid, edgeId }));
        break;
      }
      case 'addAfterNode': {
        // 新节点放在源节点右侧，并自动连线 源→新节点
        const sourceNodeId = payload.id;
        const sourcePosition = payload.position || { x: 300, y: 200 };
        const newNode = {
          id: generateNodeStepId(),
          type: 'request',
          position: { x: sourcePosition.x + 280, y: sourcePosition.y },
          inputs: []
        };
        takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
        dispatch(addFlowNode({ collectionUid, itemUid: flow.uid, node: newNode }));
        dispatch(addFlowEdge({
          collectionUid,
          itemUid: flow.uid,
          edge: {
            id: `edge_${sourceNodeId}_${newNode.id}`,
            source: sourceNodeId,
            target: newNode.id
          }
        }));
        break;
      }
      case 'addNodeAtPane': {
        const { paneX: x, paneY: y } = payload;
        const newNode = {
          id: generateNodeStepId(),
          type: 'request',
          position: { x: x || 300, y: y || 200 },
          inputs: []
        };
        takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
        dispatch(addFlowNode({ collectionUid, itemUid: flow.uid, node: newNode }));
        break;
      }
      case 'configureCondition': {
        // payload 为 ReactFlow 边对象，打开条件配置弹窗
        setConditionEdge(payload);
        break;
      }
      default:
        break;
    }
  }, [collectionUid, flow, dispatch, takeSnapshot, handleEditRequest, handleDuplicateRequest]);

  // 保存边条件（null 表示清除条件，恢复默认分支）
  const handleSaveCondition = useCallback((condition) => {
    if (!conditionEdge) return;
    takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
    const updatedEdges = (flow?.flow?.edges || []).map((e) => {
      if (e.id !== conditionEdge.id) return e;
      if (condition) {
        return { ...e, condition };
      }
      const { condition: _d, ...rest } = e;
      return rest;
    });
    dispatch(updateFlowEdges({ collectionUid, itemUid: flow.uid, edges: updatedEdges }));
    setConditionEdge(null);
  }, [conditionEdge, flow, collectionUid, dispatch, takeSnapshot]);

  // 自动布局（简单分层，固定 Start/End 位置）
  const handleAutoLayout = useCallback(() => {
    if (!flow?.flow?.nodes) return;
    takeSnapshot(flow.flow.nodes, flow.flow.edges);
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
  }, [flow?.flow, collectionUid, flow?.uid, dispatch, takeSnapshot]);

  // 更新节点（别名/错误处理等修改）
  const handleUpdateNode = useCallback((nodeId, updates) => {
    dispatch(updateFlowNode({
      collectionUid,
      itemUid: flow.uid,
      nodeId,
      updates
    }));
  }, [collectionUid, flow?.uid, dispatch]);

  const handleUpdateNodeInputs = useCallback((nodeId, inputs) => {
    dispatch(updateFlowNodeInputs({
      collectionUid,
      itemUid: flow.uid,
      nodeId,
      inputs
    }));
  }, [collectionUid, flow?.uid, dispatch]);

  // 一键映射下游：为下游节点真实创建一条引用当前步骤响应体的输入映射
  // 源节点有多个下游请求节点时弹窗选择目标（quickMapTargets）
  const applyQuickMap = useCallback((sourceStepId, targetEdge) => {
    const nodes = flow?.flow?.nodes || [];
    const downstreamNodeId = targetEdge.target;
    const downstreamNode = nodes.find((n) => n.id === downstreamNodeId);
    setSelectedNodeId(downstreamNodeId);
    if (!downstreamNode) return;

    const expression = `{{$flow.${sourceStepId}.body}}`;
    const existingInputs = downstreamNode.inputs || [];
    if (existingInputs.some((inp) => inp?.source?.kind === 'flow' && inp.source.expression === expression)) {
      toast('下游节点已存在该响应映射', { icon: 'ℹ️' });
      return;
    }

    // 变量名：源节点别名（sanitize），冲突时追加序号
    const sourceNode = nodes.find((n) => n.id === sourceStepId);
    const baseName = String(sourceNode?.alias || sourceStepId)
      .replace(/[^A-Za-z0-9_\u4e00-\u9fa5]/g, '_')
      .replace(/^(\d)/, '_$1') || `resp_${sourceStepId}`;
    const usedNames = new Set(existingInputs.map((inp) => inp?.name));
    let varName = baseName;
    let suffix = 2;
    while (usedNames.has(varName)) {
      varName = `${baseName}_${suffix}`;
      suffix += 1;
    }

    takeSnapshot(nodes, flow?.flow?.edges || []);
    handleUpdateNodeInputs(downstreamNodeId, [
      ...existingInputs,
      { name: varName, source: { kind: 'flow', expression } }
    ]);
    toast.success(`已添加映射「${varName}」，可在工作台调整`);
  }, [flow?.flow?.nodes, flow?.flow?.edges, takeSnapshot, handleUpdateNodeInputs, setSelectedNodeId]);

  const handleQuickMap = useCallback((sourceStepId) => {
    const edges = flow?.flow?.edges || [];
    const nodes = flow?.flow?.nodes || [];
    const downstreamEdges = edges.filter((e) => e.source === sourceStepId && e.target !== 'end');
    if (downstreamEdges.length === 0) {
      toast.error('该节点没有下游请求节点');
      return;
    }
    if (downstreamEdges.length === 1) {
      applyQuickMap(sourceStepId, downstreamEdges[0]);
      return;
    }
    // 多个下游：弹窗选择目标
    setQuickMapTargets({
      sourceStepId,
      targets: downstreamEdges.map((edge) => {
        const targetNode = nodes.find((n) => n.id === edge.target);
        const info = requestInfoMap?.[targetNode?.requestUid];
        return {
          ...edge,
          label: targetNode?.alias || edge.target,
          method: info?.method,
          url: info?.url
        };
      })
    });
  }, [flow?.flow?.edges, flow?.flow?.nodes, requestInfoMap, applyQuickMap]);

  return {
    conditionEdge,
    clearConditionEdge: () => setConditionEdge(null),
    deleteTarget,
    clearDeleteTarget: () => setDeleteTarget(null),
    handleConfirmDelete,
    quickMapTargets,
    clearQuickMapTargets: () => setQuickMapTargets(null),
    handleContextMenuAction,
    handleSaveCondition,
    handleAutoLayout,
    handleUpdateNode,
    handleUpdateNodeInputs,
    handleEditRequest,
    handleDuplicateRequest,
    handleDeleteRequest,
    handleQuickMap,
    applyQuickMap
  };
}

export default useFlowGraphActions;
