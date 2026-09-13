/**
 * 右侧节点工作台（壳组件）。
 *
 * 职责：面板宽度拖拽与持久化、Tab 切换、运行历史回看状态（viewingRecord）、
 * 选中节点变化时的状态复位与自动切换结果 Tab。
 *
 * 拆分子模块：
 * - workbench/styled.js          样式与展示工具
 * - workbench/useMappingEditor   输入映射编辑器状态（跨 Tab 保留）
 * - workbench/RunOverview        运行总览 + 历史回看
 * - workbench/NodeDetail         节点运行详情
 * - workbench/ConfigTab          节点配置
 *
 * Tab「配置」：别名、错误处理策略、输入映射（防抖自动保存）与请求操作。
 * Tab「运行结果」：运行总览 + 选中节点的执行详情，运行完成后自动切换到此 Tab。
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { WORKBENCH_MIN_WIDTH, WORKBENCH_DEFAULT_WIDTH, WORKBENCH_MAX_VIEWPORT_RATIO, WORKBENCH_HIDE_THRESHOLD, WORKBENCH_WIDTH_STORAGE_KEY, getStatusColor } from './constants';
import FlowResponsePicker from './FlowResponsePicker';
import useMappingEditor from './workbench/useMappingEditor';
import RunOverview from './workbench/RunOverview';
import NodeDetail from './workbench/NodeDetail';
import ConfigTab from './workbench/ConfigTab';
import {
  ResizeHandle,
  TabBody,
  TabButton,
  TabHeader,
  TabStatusDot,
  WorkbenchContainer,
  WorkbenchRoot
} from './workbench/styled';

const FlowWorkbench = ({
  selectedNode,
  flowRun,
  edges,
  nodes,
  requestItem,
  collection,
  collectionUid,
  flowHistory,
  onLoadHistoryRecord,
  onClearHistory,
  collapsed,
  onCollapsedChange,
  onSelectStep,
  onUpdateNode,
  onUpdateInputs,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onQuickMap
}) => {
  const selectedNodeId = selectedNode?.id;
  const [activeTab, setActiveTab] = useState('config');
  // 运行历史回看：null 表示查看本次运行
  const [viewingRecord, setViewingRecord] = useState(null);

  const editor = useMappingEditor({ selectedNode, onUpdateInputs });

  // 新一轮运行开始时自动退出历史回看
  useEffect(() => {
    if (flowRun?.status === 'running') {
      setViewingRecord(null);
    }
  }, [flowRun?.status]);

  // 历史回看时用记录中的节点状态渲染总览与详情
  const displayRun = viewingRecord
    ? {
        flowRunId: viewingRecord.runId,
        status: viewingRecord.status,
        nodes: viewingRecord.nodes
      }
    : flowRun;

  // 快速切换历史记录时的竞态防护：只采纳最后一次请求的记录
  const historyLoadSeqRef = useRef(0);
  const handleHistorySelect = async (event) => {
    const runId = event.target.value;
    if (!runId) {
      setViewingRecord(null);
      return;
    }
    const seq = ++historyLoadSeqRef.current;
    const record = onLoadHistoryRecord ? await onLoadHistoryRecord(runId) : null;
    if (record && seq === historyLoadSeqRef.current) {
      setViewingRecord(record);
    }
  };

  const handleClearHistory = async () => {
    if (onClearHistory) {
      await onClearHistory();
    }
    setViewingRecord(null);
  };

  // 面板宽度（持久化到 localStorage）；折叠状态由父组件持有（顶栏按钮可切换）
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage?.getItem(WORKBENCH_WIDTH_STORAGE_KEY));
    if (!stored || stored < WORKBENCH_MIN_WIDTH) {
      return WORKBENCH_DEFAULT_WIDTH;
    }
    // 持久化值可能来自不同视口尺寸，读取时按当前视口重新约束
    const maxWidth = Math.max(WORKBENCH_MIN_WIDTH, Math.round(window.innerWidth * WORKBENCH_MAX_VIEWPORT_RATIO));
    return Math.min(maxWidth, stored);
  });
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef(null);
  const containerRef = useRef(null);

  const handleResizeStart = useCallback((event) => {
    event.preventDefault();
    dragStateRef.current = { startX: event.clientX, startWidth: width, nextWidth: width };
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return undefined;
    const maxWidth = Math.max(WORKBENCH_MIN_WIDTH, Math.round(window.innerWidth * WORKBENCH_MAX_VIEWPORT_RATIO));
    const clamp = (v) => Math.min(maxWidth, Math.max(WORKBENCH_MIN_WIDTH, v));
    // 拖拽期间直接写 DOM 宽度，不触发 React 重渲染——
    // 避免每次 mousemove 都让 ReactFlow 重新布局，引发 ResizeObserver 循环告警
    const handleMouseMove = (e) => {
      const state = dragStateRef.current;
      if (!state || state.startX === undefined) return;
      const next = state.startWidth + (state.startX - e.clientX);
      // 拖到阈值以下：面板完全隐藏，松手后可从顶栏按钮重新唤起
      if (next < WORKBENCH_HIDE_THRESHOLD) {
        state.nextWidth = null; // 不记录过窄的宽度
        onCollapsedChange?.(true);
        return;
      }
      state.nextWidth = clamp(next);
      if (containerRef.current) {
        containerRef.current.style.width = `${state.nextWidth}px`;
      }
    };
    const handleMouseUp = () => {
      setDragging(false);
      const nextWidth = dragStateRef.current?.nextWidth;
      if (nextWidth != null) {
        setWidth(nextWidth);
        window.localStorage?.setItem(WORKBENCH_WIDTH_STORAGE_KEY, String(nextWidth));
      }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, onCollapsedChange]);

  // 选中节点变化 / Redux inputs 变化：复位映射编辑器（hook 内处理），
  // 并复位 Tab 与全屏浮层（从结果 Tab 总览切换时保持结果 Tab）
  const suppressTabResetRef = useRef(false);
  const mappingSignature = JSON.stringify(selectedNode?.data?.inputs || []);
  useEffect(() => {
    if (suppressTabResetRef.current) {
      suppressTabResetRef.current = false;
    } else {
      setActiveTab('config');
    }
  }, [selectedNodeId, mappingSignature]);

  // 选中节点运行结束（running → 终态）时自动切到结果 Tab
  const selectedRunState = selectedNodeId ? flowRun?.nodes?.[selectedNodeId] : null;
  const prevRunStatusRef = useRef(null);
  useEffect(() => {
    const status = selectedRunState?.status;
    if (
      prevRunStatusRef.current === 'running'
      && ['success', 'failed', 'cancelled'].includes(status)
    ) {
      setActiveTab('result');
    }
    prevRunStatusRef.current = status;
  }, [selectedRunState?.status, selectedNodeId]);

  // 从结果 Tab 总览中切换选中节点时，保持在结果 Tab（抑制切换节点默认回配置 Tab）
  const handleSelectStepFromOverview = (stepId) => {
    suppressTabResetRef.current = true;
    onSelectStep?.(stepId);
  };

  const getNodeName = useCallback((stepId) => {
    const node = nodes?.find((n) => n.id === stepId);
    return node ? (node.alias || node.id) : stepId;
  }, [nodes]);

  // 完全隐藏：不渲染任何内容，通过顶栏按钮唤起
  if (collapsed) {
    return null;
  }

  // 结果 Tab 上的状态点（取实时运行态，历史回看时不随记录变化）
  const selectedRunStatus = selectedNodeId ? flowRun?.nodes?.[selectedNodeId]?.status : null;
  const tabDotColor = selectedRunStatus ? getStatusColor(selectedRunStatus) : null;

  return (
    <WorkbenchRoot>
      <ResizeHandle
        onMouseDown={handleResizeStart}
        title="拖拽调整宽度，拖到最窄可完全隐藏"
      />
      <WorkbenchContainer ref={containerRef} $width={width}>
        <TabHeader>
          <TabButton
            $active={activeTab === 'config'}
            onClick={() => setActiveTab('config')}
          >
            配置
          </TabButton>
          <TabButton
            $active={activeTab === 'result'}
            onClick={() => setActiveTab('result')}
          >
            {tabDotColor && <TabStatusDot $color={tabDotColor} />}
            运行结果
          </TabButton>
        </TabHeader>
        <TabBody>
          {activeTab === 'config' ? (
            <ConfigTab
              selectedNode={selectedNode}
              nodes={nodes}
              editor={editor}
              onUpdateNode={onUpdateNode}
              onEditRequest={onEditRequest}
              onDeleteRequest={onDeleteRequest}
              onDuplicateRequest={onDuplicateRequest}
            />
          ) : (
            <>
              <RunOverview
                displayRun={displayRun}
                viewingRecord={viewingRecord}
                flowHistory={flowHistory}
                selectedNodeId={selectedNodeId}
                onSelectStep={handleSelectStepFromOverview}
                onHistorySelect={handleHistorySelect}
                onClearHistory={handleClearHistory}
                getNodeName={getNodeName}
              />
              <NodeDetail
                key={selectedNodeId || 'none'}
                selectedNode={selectedNode}
                displayRun={displayRun}
                requestItem={requestItem}
                collection={collection}
                edges={edges}
                onQuickMap={onQuickMap}
              />
            </>
          )}
        </TabBody>
      </WorkbenchContainer>

      {editor.flowResponsePickerOpenIndex !== null && selectedNode && (
        <FlowResponsePicker
          flowRun={flowRun}
          edges={edges}
          selectedNodeId={selectedNode.id}
          nodes={nodes}
          onClose={() => editor.setFlowResponsePickerOpenIndex(null)}
          onInsertExpression={(expression) => {
            editor.updateMappingSource(editor.flowResponsePickerOpenIndex, { expression });
          }}
        />
      )}
    </WorkbenchRoot>
  );
};

export default FlowWorkbench;
