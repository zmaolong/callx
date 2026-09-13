/**
 * FlowTab — Flow 编排容器（组合根）。
 *
 * 职责拆分：
 * - hooks/useFlowReconcile   目录请求 ↔ 画布节点自动协调
 * - hooks/useFlowSave        手动保存
 * - hooks/useFlowValidation  图校验 / 错误定位
 * - hooks/useFlowRun         运行编排（整链/到此/单跑/取消）
 * - hooks/useFlowHistory     运行历史
 * - hooks/useFlowGraphActions 图编辑动作（右键菜单/条件/快速映射/布局）
 * - hooks/useFlowUndo        撤销重做栈（shared hooks）
 * 本文件只负责状态接线与布局 JSX。
 */
import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import FlowCanvas from './FlowCanvas';
import FlowTopBar from './FlowTopBar';
import FlowWorkbench from './FlowWorkbench';
import FlowConditionModal from './FlowConditionModal';
import QuickMapTargetModal from './QuickMapTargetModal';
import StyledWrapper from './StyledWrapper';
import { findCollectionByItemUid, findItemInCollection } from 'utils/collections';
import {
  updateFlowNodes,
  updateFlowEdges
} from 'providers/ReduxStore/slices/collections';
import { clearFlowRunState } from 'providers/ReduxStore/slices/flowRun';
import { clearFlowExternalChange } from 'providers/ReduxStore/slices/flowEditor';
import { useFlowUndo } from 'hooks/useFlowUndo';
import Modal from 'components/Modal';
import toast from 'react-hot-toast';
import { WORKBENCH_COLLAPSED_STORAGE_KEY } from './constants';
import useFlowReconcile from './hooks/useFlowReconcile';
import useFlowSave from './hooks/useFlowSave';
import useFlowValidation from './hooks/useFlowValidation';
import useFlowRun from './hooks/useFlowRun';
import useFlowHistory from './hooks/useFlowHistory';
import useFlowGraphActions from './hooks/useFlowGraphActions';

const FlowTab = ({ flow }) => {
  const dispatch = useDispatch();
  const store = useStore();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
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
  // 画布未保存修改与磁盘变更冲突提示（flowDirtyMiddleware 维护）
  const flowDirty = useSelector((state) => state.flowEditor?.dirtyByUid?.[flow?.uid]);
  const flowExternalChange = useSelector((state) => state.flowEditor?.externalChangeByUid?.[flow?.uid]);

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

  // —— 职责 hooks ——
  useFlowReconcile(flow, collection);
  const { handleManualSave } = useFlowSave({ flow, collectionUid });
  const { errors, handleValidate, focusNode, handleFocusError } = useFlowValidation({
    flow,
    setSelectedNodeId,
    canvasInstanceRef
  });
  const openWorkbench = useCallback(() => handleWorkbenchCollapsedChange(false), [handleWorkbenchCollapsedChange]);
  const {
    isRunning,
    handleRun,
    handleRunUntilNode,
    handleRunNode,
    handleCancel
  } = useFlowRun({
    flow,
    collection,
    store,
    flowRun,
    handleValidate,
    selectedNodeId,
    onRunningStarted: openWorkbench
  });
  const { flowHistory, handleLoadHistoryRecord, handleClearHistory } = useFlowHistory({
    flow,
    collectionUid,
    flowRun
  });
  const {
    conditionEdge,
    clearConditionEdge,
    deleteTarget,
    clearDeleteTarget,
    handleConfirmDelete,
    quickMapTargets,
    clearQuickMapTargets,
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
  } = useFlowGraphActions({
    flow,
    collection,
    collectionUid,
    requestInfoMap,
    takeSnapshot,
    setSelectedNodeId
  });

  // 撤销/重做（整图快照替换）
  const applySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
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
  }, [flow?.uid, collectionUid, dispatch]);

  const handleUndo = useCallback(() => {
    applySnapshot(undo(flow?.flow?.nodes || [], flow?.flow?.edges || []));
  }, [undo, flow?.flow?.nodes, flow?.flow?.edges, applySnapshot]);

  const handleRedo = useCallback(() => {
    applySnapshot(redo(flow?.flow?.nodes || [], flow?.flow?.edges || []));
  }, [redo, flow?.flow?.nodes, flow?.flow?.edges, applySnapshot]);

  // 删除类操作前记录撤销快照（双击删边、键盘删节点、右键删除、建边共用）
  const takeSnapshotBeforeDelete = useCallback(() => {
    takeSnapshot(flow?.flow?.nodes, flow?.flow?.edges);
  }, [takeSnapshot, flow?.flow?.nodes, flow?.flow?.edges]);

  // 清理运行态
  useEffect(() => {
    return () => {
      if (flow?.uid) {
        dispatch(clearFlowRunState({ flowUid: flow.uid }));
      }
    };
  }, [flow?.uid, dispatch]);

  // 外部变更提示：磁盘 flow.yml 有变更但画布存在未保存修改，内存版本已保留
  useEffect(() => {
    if (flowExternalChange && flow?.uid) {
      toast('检测到磁盘变更，未保存的画布修改已保留', { icon: '⚠️', duration: 5000 });
      dispatch(clearFlowExternalChange({ flowUid: flow.uid }));
    }
  }, [flowExternalChange, flow?.uid, dispatch]);

  return (
    <StyledWrapper className="flex flex-col flex-grow">
      <FlowTopBar
        flowName={flow?.name}
        isRunning={isRunning}
        isDirty={Boolean(flowDirty)}
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
              onCancelRun={handleCancel}
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
          collectionUid={collectionUid}
          flowName={flow?.name}
          flowHistory={flowHistory}
          onLoadHistoryRecord={handleLoadHistoryRecord}
          onClearHistory={handleClearHistory}
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
          handleCancel={clearDeleteTarget}
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
          onClose={clearConditionEdge}
        />
      )}

      {quickMapTargets && (
        <QuickMapTargetModal
          sourceName={
            flow?.flow?.nodes?.find((n) => n.id === quickMapTargets.sourceStepId)?.alias
            || quickMapTargets.sourceStepId
          }
          targets={quickMapTargets.targets}
          onSelect={(edge) => {
            const { sourceStepId } = quickMapTargets;
            clearQuickMapTargets();
            applyQuickMap(sourceStepId, edge);
          }}
          onClose={clearQuickMapTargets}
        />
      )}
    </StyledWrapper>
  );
};

export default FlowTab;
