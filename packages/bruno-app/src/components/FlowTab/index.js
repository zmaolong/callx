import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import FlowCanvas from './FlowCanvas';
import FlowTopBar from './FlowTopBar';
import FlowWorkbench from './FlowWorkbench';
import FlowConditionModal from './FlowConditionModal';
import StyledWrapper from './StyledWrapper';
import { reconcileFlowNodes, removeOrphanedNodes } from 'utils/flow/reconcile';
import { findItemInCollection, findCollectionByItemUid } from 'utils/collections';
import { validateGraph, generateNodeStepId } from 'utils/flow/graph';
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
import { saveFlow, deleteItem, cloneItem } from 'providers/ReduxStore/slices/collections/actions';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { sanitizeName } from 'utils/common/regex';
import { executeFlow, executeSingleNode, cancelFlow } from 'utils/flow/executor';
import { clearFlowRunState } from 'providers/ReduxStore/slices/flowRun';
import { useFlowUndo } from 'hooks/useFlowUndo';
import Modal from 'components/Modal';
import toast from 'react-hot-toast';
import { WORKBENCH_COLLAPSED_STORAGE_KEY } from './constants';

const FlowTab = ({ flow }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // 正在配置条件的边（右键菜单「配置条件」打开弹窗）
  const [conditionEdge, setConditionEdge] = useState(null);
  // 右侧工作台折叠状态（顶栏按钮与面板内按钮共用；持久化 localStorage）
  const [workbenchCollapsed, setWorkbenchCollapsed] = useState(
    () => window.localStorage?.getItem(WORKBENCH_COLLAPSED_STORAGE_KEY) === '1'
  );
  // ReactFlow 实例（用于节点定位 setCenter）
  const canvasInstanceRef = useRef(null);

  const handleWorkbenchCollapsedChange = useCallback((next) => {
    setWorkbenchCollapsed(next);
    window.localStorage?.setItem(WORKBENCH_COLLAPSED_STORAGE_KEY, next ? '1' : '0');
  }, []);

  const flowRun = useSelector((state) => state.flowRun?.runs?.[flow?.uid]);
  const collections = useSelector((state) => state.collections.collections);

  // 使用 useMemo 缓存集合查找结果，避免每次 Redux 状态变化都重建所有扁平化数组
  const collection = useMemo(() => {
    if (!flow) return null;
    return findCollectionByItemUid(collections, flow.uid);
  }, [collections, flow?.uid]);

  const collectionUid = collection?.uid;

  // 撤销/重做历史栈
  const { canUndo, canRedo, takeSnapshot, undo, redo } = useFlowUndo(flow?.uid);

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

  const isRequestNode = selectedNode
    && (selectedNode.data?.type || selectedNode.type) === 'request';
  const selectedNodeRunning = isRequestNode
    && flowRun?.nodes?.[selectedNodeId]?.status === 'running';

  // 选中节点对应的请求 item（内嵌请求编辑器与结果响应视图共用）
  const selectedRequestItem = useMemo(() => {
    if (!isRequestNode || !collection || !selectedNode?.data?.requestUid) return null;
    return findItemInCollection(collection, selectedNode.data.requestUid) || null;
  }, [isRequestNode, collection, selectedNode?.data?.requestUid]);

  // 手动保存：立即执行，显示成功/失败反馈（请求配置在标准请求 Tab 中编辑与保存）
  const handleManualSave = useCallback(() => {
    if (!flow?.uid || !collectionUid) {
      toast.error('无法保存：Flow 数据不完整');
      return;
    }
    const result = dispatch(saveFlow(flow.uid, collectionUid, false));
    toast.loading('正在保存 Flow...', { id: 'flow-save' });
    if (result && result.then) {
      result.then(() => { toast.success('Flow 保存成功!', { id: 'flow-save' }); })
        .catch((err) => { toast.error('保存失败: ' + (err?.message || err), { id: 'flow-save' }); });
    }
  }, [collectionUid, flow?.uid, dispatch]);

  // 删除类操作前记录撤销快照（双击删边、键盘删节点、右键删除共用）
  const takeSnapshotBeforeDelete = useCallback(() => {
    takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
  }, [takeSnapshot, flow?.flow?.nodes, flow?.flow?.edges]);

  // 撤销/重做
  const handleUndo = useCallback(() => {
    const snapshot = undo(flow?.flow?.nodes || [], flow?.flow?.edges || []);
    if (snapshot) {
      dispatch(updateFlowNodes({
        collectionUid,
        itemUid: flow.uid,
        nodes: snapshot.nodes
      }));
      dispatch(updateFlowEdges({
        collectionUid,
        itemUid: flow.uid,
        edges: snapshot.edges
      }));
    }
  }, [undo, flow, collectionUid, dispatch]);

  const handleRedo = useCallback(() => {
    const snapshot = redo(flow?.flow?.nodes || [], flow?.flow?.edges || []);
    if (snapshot) {
      dispatch(updateFlowNodes({
        collectionUid,
        itemUid: flow.uid,
        nodes: snapshot.nodes
      }));
      dispatch(updateFlowEdges({
        collectionUid,
        itemUid: flow.uid,
        edges: snapshot.edges
      }));
    }
  }, [redo, flow, collectionUid, dispatch]);

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
        takeSnapshotBeforeDelete();
        dispatch(removeFlowNode({ collectionUid, itemUid: flow.uid, nodeId }));
        break;
      }
      case 'deleteEdge': {
        const edgeId = payload.id;
        takeSnapshotBeforeDelete();
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
  }, [collectionUid, flow, dispatch, takeSnapshot, takeSnapshotBeforeDelete, handleEditRequest, handleDuplicateRequest]);

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
  }, [flow?.uid, collection?.uid]);

  // 校验
  const handleValidate = useCallback(() => {
    if (!flow?.flow) return [];
    const validationErrors = validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
    return validationErrors;
  }, [flow?.flow]);

  // 构建执行上下文：collectionItems 映射 + collection 副本（执行过程会写入 runtimeVariables）
  const buildExecutionContext = useCallback(() => {
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
    return { collectionItems, collectionCopy };
  }, [flow, collection]);

  // 运行整条 Flow（stopAtNodeId 可选：从 Start 执行到该节点为止）
  const runFlow = useCallback(async (stopAtNodeId) => {
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

    try {
      const { collectionItems, collectionCopy } = buildExecutionContext();
      const result = await executeFlow({
        flowUid: flow.uid,
        collectionUid: collection.uid,
        flow: flow.flow,
        collection: collectionCopy,
        collectionItems,
        dispatch,
        getState: store.getState,
        stopAtNodeId
      });
      if (result && !result.success) {
        toast.error(result.error || 'Flow 执行失败');
      }
    } finally {
      setIsRunning(false);
    }
  }, [handleValidate, flow, collection, dispatch, store, buildExecutionContext]);

  const handleRun = useCallback(() => runFlow(undefined), [runFlow]);

  // 运行到此节点（含）
  const handleRunUntilNode = useCallback(() => {
    if (!selectedNodeId) return;
    runFlow(selectedNodeId);
  }, [runFlow, selectedNodeId]);

  // 单跑选中节点（使用上游已缓存响应，不做全图校验）
  const handleRunNode = useCallback(async () => {
    if (!selectedNodeId || !flow || !collection || !flow.flow) return;

    setIsRunning(true);
    try {
      const { collectionItems, collectionCopy } = buildExecutionContext();
      const result = await executeSingleNode({
        flowUid: flow.uid,
        collectionUid: collection.uid,
        flow: flow.flow,
        collection: collectionCopy,
        collectionItems,
        stepId: selectedNodeId,
        dispatch,
        getState: store.getState
      });
      if (result && !result.success && !result.cancelled) {
        toast.error(result.error || '节点执行失败');
      }
    } finally {
      setIsRunning(false);
    }
  }, [selectedNodeId, flow, collection, dispatch, store, buildExecutionContext]);

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

  // 开始运行时自动唤起右侧工作台（运行结果都在面板中展示）
  useEffect(() => {
    if (flowRun?.status === 'running') {
      handleWorkbenchCollapsedChange(false);
    }
  }, [flowRun?.status, handleWorkbenchCollapsedChange]);

  // 校验错误（附加节点显示名，供顶栏错误弹层展示与定位）
  const errors = useMemo(() => {
    if (!flow?.flow) return [];
    const validationErrors = validateGraph(flow.flow.nodes || [], flow.flow.edges || []);
    const nodeNames = {};
    for (const n of flow.flow.nodes || []) {
      nodeNames[n.id] = n.alias || n.id;
    }
    return validationErrors.map((e) => ({
      ...e,
      nodeName: e.nodeId
        ? (nodeNames[e.nodeId] || e.nodeId)
        : (e.edgeId ? `边 ${e.edgeId}` : null)
    }));
  }, [flow?.flow]);

  // 定位节点：选中并居中到画布
  const focusNode = useCallback((nodeId) => {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    const node = (flow?.flow?.nodes || []).find((n) => n.id === nodeId);
    const instance = canvasInstanceRef.current;
    if (node?.position && instance?.setCenter) {
      instance.setCenter(node.position.x + 100, node.position.y + 30, { zoom: 1.2, duration: 400 });
    }
  }, [flow?.flow?.nodes]);

  // 点击错误明细 → 定位到相关节点
  const handleFocusError = useCallback((error) => {
    let nodeId = error?.nodeId;
    if (!nodeId && error?.edgeId) {
      const edge = (flow?.flow?.edges || []).find((e) => e.id === error.edgeId);
      nodeId = edge?.source;
    }
    if (!nodeId) return;
    focusNode(nodeId);
  }, [flow?.flow?.edges, focusNode]);

  // 请求信息映射（method/url/name），供画布节点卡片展示
  const requestInfoMap = useMemo(() => {
    const map = {};
    const walk = (items) => {
      for (const item of items || []) {
        if (item.uid && item.request) {
          map[item.uid] = {
            method: item.request.method,
            url: item.request.url,
            name: item.name
          };
        }
        if (item.items) walk(item.items);
      }
    };
    walk(flow?.items);
    walk(collection?.items);
    return map;
  }, [flow?.items, collection?.items]);

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
  const handleQuickMap = useCallback((sourceStepId) => {
    const edges = flow?.flow?.edges || [];
    const nodes = flow?.flow?.nodes || [];
    const targetEdge = edges.find((e) => e.source === sourceStepId && e.target !== 'end');
    if (!targetEdge) return;

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

    takeSnapshot(nodes, edges);
    handleUpdateNodeInputs(downstreamNodeId, [
      ...existingInputs,
      { name: varName, source: { kind: 'flow', expression } }
    ]);
    toast.success(`已添加映射「${varName}」，可在工作台调整`);
  }, [flow?.flow?.edges, flow?.flow?.nodes, takeSnapshot, handleUpdateNodeInputs]);

  return (
    <StyledWrapper className="flex flex-col flex-grow">
      <FlowTopBar
        flowName={flow?.name}
        isRunning={isRunning}
        onRun={handleRun}
        onCancel={handleCancel}
        hasSelectedRequestNode={Boolean(isRequestNode)}
        selectedNodeRunning={selectedNodeRunning}
        onRunNode={handleRunNode}
        onRunUntilNode={handleRunUntilNode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAutoLayout={handleAutoLayout}
        onSave={handleManualSave}
        errors={errors}
        onFocusError={handleFocusError}
        workbenchCollapsed={workbenchCollapsed}
        onToggleWorkbench={() => handleWorkbenchCollapsedChange(!workbenchCollapsed)}
      />

      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flexGrow: 1, position: 'relative', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flexGrow: 1, position: 'relative' }}>
            <FlowCanvas
              flow={flow}
              collectionUid={collectionUid}
              onSelectNode={(node) => setSelectedNodeId(node ? node.id : null)}
              onContextMenu={handleContextMenuAction}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onBeforeDelete={takeSnapshotBeforeDelete}
              onInstanceReady={(instance) => { canvasInstanceRef.current = instance; }}
              requestInfoMap={requestInfoMap}
              onSave={handleManualSave}
            />
          </div>
        </div>

        <FlowWorkbench
          selectedNode={selectedNode}
          flowRun={flowRun}
          edges={flow?.flow?.edges}
          nodes={flow?.flow?.nodes}
          requestItem={selectedRequestItem}
          collection={collection}
          collapsed={workbenchCollapsed}
          onCollapsedChange={handleWorkbenchCollapsedChange}
          onSelectStep={focusNode}
          onUpdateNode={handleUpdateNode}
          onUpdateInputs={handleUpdateNodeInputs}
          onEditRequest={handleEditRequest}
          onDeleteRequest={handleDeleteRequest}
          onDuplicateRequest={handleDuplicateRequest}
          onQuickMap={handleQuickMap}
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

      {conditionEdge && (
        <FlowConditionModal
          edge={conditionEdge}
          nodes={flow?.flow?.nodes}
          edges={flow?.flow?.edges}
          flowRun={flowRun}
          onSave={handleSaveCondition}
          onClose={() => setConditionEdge(null)}
        />
      )}
    </StyledWrapper>
  );
};

export default FlowTab;
