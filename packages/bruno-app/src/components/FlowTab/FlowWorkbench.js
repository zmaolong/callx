import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  IconPencil,
  IconCopy,
  IconTrash,
  IconPlus,
  IconCode,
  IconMaximize,
  IconMinimize,
  IconChevronRight,
  IconChevronLeft,
  IconArrowRight,
  IconRefresh,
  IconCircleCheck,
  IconCircleX,
  IconCircleOff
} from '@tabler/icons';
import { validateInputMappings } from 'utils/flow/input-mapping';
import FlowResponsePicker from './FlowResponsePicker';
import FlowResponseView from './FlowResponseView';
import {
  getStatusColor,
  STATUS_COLORS,
  STATUS_BADGE_BG,
  WORKBENCH_MIN_WIDTH,
  WORKBENCH_DEFAULT_WIDTH,
  WORKBENCH_MAX_VIEWPORT_RATIO,
  WORKBENCH_WIDTH_STORAGE_KEY,
  WORKBENCH_COLLAPSED_STORAGE_KEY
} from './constants';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const SpinningIcon = styled(IconRefresh)`
  animation: ${spin} 1s linear infinite;
`;

const WorkbenchRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  height: 100%;
`;

const ResizeHandle = styled.div`
  width: 4px;
  cursor: col-resize;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s ease;

  &:hover,
  &:active {
    background: ${(props) => props.theme.colors?.accent || '#3b82f6'};
  }
`;

const WorkbenchContainer = styled.div`
  width: ${(props) => props.$width}px;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
  flex-shrink: 0;
  min-height: 0;
`;

const CollapsedBar = styled.div`
  width: 28px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 10px;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
`;

const CollapseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.theme.colors.text.muted};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
  }
`;

const TabHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 0 8px;
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
  flex-shrink: 0;
`;

const TabButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 7px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    color: ${(props) => props.theme.text};
  }

  ${(props) => props.$active && `
    color: ${props.theme.text};
    border-bottom-color: ${props.theme.colors?.accent || '#3b82f6'};
  `}
`;

const TabStatusDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => props.$color};
  flex-shrink: 0;
`;

const TabBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
`;

/* ---------- 表单通用 ---------- */

const InputLabel = styled.label`
  display: block;
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  margin-bottom: 4px;
`;

const SidebarInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input.border};
  background: ${(props) => props.theme.input.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input.focusBorder};
  }
`;

const SidebarTextarea = styled(SidebarInput)`
  resize: vertical;
  min-height: 60px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
`;

const SidebarSelect = styled.select`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input.border};
  background: ${(props) => props.theme.input.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input.focusBorder};
  }
`;

const SectionTitle = styled.div`
  font-weight: 600;
  font-size: 13px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

const MutedText = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
`;

const EmptyContent = styled.div`
  color: ${(props) => props.theme.colors.text.muted};
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: none;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  background: ${(props) => props.$danger ? props.theme.button.danger.bg : props.theme.background.surface0};
  color: ${(props) => props.$danger ? props.theme.button.danger.color : props.theme.text};
  transition: background 0.15s ease;

  &:hover {
    background: ${(props) => props.$danger
      ? props.theme.button.danger.bg
      : props.theme.background.surface1};
  }
`;

/* ---------- 输入映射 ---------- */

const MappingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

const MappingButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 26px;
  padding: 4px 6px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  cursor: pointer;
  font-size: 11px;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const MappingRow = styled.div`
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
`;

const MappingRowHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`;

const MappingField = styled.div`
  margin-top: 6px;
`;

const MappingError = styled.div`
  margin-top: 6px;
  color: ${(props) => props.theme.status.danger.text};
  font-size: 11px;
  line-height: 1.35;
`;

const IconButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.theme.colors.text.muted};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.$danger ? props.theme.button.danger.color : props.theme.text};
  }
`;

const EmptyMappings = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  font-style: italic;
`;

/* ---------- 结果 Tab ---------- */

const ResultStatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color};
`;

const ResultMeta = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
`;

const HttpStatusText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => props.$color};
`;

const DetailSection = styled.div`
  margin-bottom: 14px;
`;

const DetailTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`;

const DetailTitle = styled.div`
  font-weight: 600;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  td {
    padding: 3px 8px;
    border: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
  }

  td:first-child {
    width: 120px;
    font-weight: 600;
    color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
    background: ${(props) => props.theme.background.surface0};
  }

  td:last-child {
    color: ${(props) => props.theme.text};
    word-break: break-all;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
`;

const ErrorText = styled.div`
  padding: 6px 8px;
  background: ${(props) => props.theme.status.danger?.background || 'rgba(239,68,68,0.1)'};
  border: 1px solid ${(props) => props.theme.status.danger?.text || '#ef4444'};
  border-radius: 4px;
  color: ${(props) => props.theme.status.danger?.text || '#ef4444'};
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
`;

const QuickMapButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: 4px;
  background: ${(props) => props.theme.background.surface0};
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
  }
`;

// 请求预览折叠块
const RequestPreview = styled.details`
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  font-size: 12px;

  summary {
    padding: 6px 8px;
    cursor: pointer;
    color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
    user-select: none;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &[open] summary {
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
  }
`;

const PreviewBody = styled.div`
  padding: 8px;
`;

// 响应体全屏浮层：absolute 相对 Flow Tab 根容器，避免盖住软件标题栏按钮
const ResponseFullscreen = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.background.base};
  padding: 16px;
`;

const ResponseFullscreenHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const UnsavedMark = styled.span`
  font-size: 10px;
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
`;

/* ---------- 逻辑常量 ---------- */

const LITERAL_TYPES = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
  { value: 'null', label: 'Null' }
];

const createEmptyMapping = () => ({
  name: '',
  source: {
    kind: 'flow',
    expression: ''
  }
});

const normalizeMapping = (mapping) => {
  if (mapping?.source?.kind === 'literal') {
    return {
      name: mapping.name || '',
      source: {
        kind: 'literal',
        value: mapping.source.value === undefined ? '' : mapping.source.value,
        valueType: mapping.source.valueType || 'string'
      }
    };
  }

  return {
    name: mapping?.name || '',
    source: {
      kind: 'flow',
      expression: mapping?.source?.expression || ''
    }
  };
};

const isEmptyMapping = (mapping) => {
  if (mapping.name.trim()) return false;
  if (mapping.source.kind === 'flow') return !mapping.source.expression?.trim();
  return mapping.source.valueType !== 'null' && String(mapping.source.value ?? '').trim() === '';
};

const getMappingsFromNode = (selectedNode) => (selectedNode?.data?.inputs || []).map(normalizeMapping);

// 输入映射即时保存防抖时长（ms）
const AUTOSAVE_DEBOUNCE = 400;

/**
 * 右侧节点工作台。
 *
 * Tab「配置」：别名、错误处理策略、输入映射（防抖自动保存）与请求操作。
 * Tab「运行结果」：选中节点的执行详情（状态、请求预览、输入变量、响应体），
 * 运行完成后自动切换到此 Tab。
 */
const FlowWorkbench = ({
  selectedNode,
  flowRun,
  edges,
  nodes,
  requestItem,
  collection,
  onUpdateNode,
  onUpdateInputs,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest,
  onQuickMap
}) => {
  const selectedNodeId = selectedNode?.id;
  const [activeTab, setActiveTab] = useState('config');
  const mappingSignature = JSON.stringify(selectedNode?.data?.inputs || []);
  const [mappings, setMappings] = useState(() => getMappingsFromNode(selectedNode));
  const [mappingErrors, setMappingErrors] = useState({});
  const [flowResponsePickerOpenIndex, setFlowResponsePickerOpenIndex] = useState(null);
  const [expandedExprIndex, setExpandedExprIndex] = useState(null);
  const [responseFullscreen, setResponseFullscreen] = useState(false);

  // 面板宽度 / 折叠状态（持久化到 localStorage）
  const [width, setWidth] = useState(() => {
    const stored = Number(window.localStorage?.getItem(WORKBENCH_WIDTH_STORAGE_KEY));
    if (!stored || stored < WORKBENCH_MIN_WIDTH) {
      return WORKBENCH_DEFAULT_WIDTH;
    }
    // 持久化值可能来自不同视口尺寸，读取时按当前视口重新约束
    const maxWidth = Math.max(WORKBENCH_MIN_WIDTH, Math.round(window.innerWidth * WORKBENCH_MAX_VIEWPORT_RATIO));
    return Math.min(maxWidth, stored);
  });
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage?.getItem(WORKBENCH_COLLAPSED_STORAGE_KEY) === '1'
  );
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
      state.nextWidth = clamp(state.startWidth + (state.startX - e.clientX));
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
  }, [dragging]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      window.localStorage?.setItem(WORKBENCH_COLLAPSED_STORAGE_KEY, prev ? '0' : '1');
      return !prev;
    });
  }, []);

  // 外部数据同步（切换节点或 Redux inputs 变化）时跳过一次自动保存
  const skipAutosaveRef = useRef(true);
  const latestSignatureRef = useRef(mappingSignature);
  latestSignatureRef.current = mappingSignature;
  useEffect(() => {
    setMappings(getMappingsFromNode(selectedNode));
    setMappingErrors({});
    setExpandedExprIndex(null);
    skipAutosaveRef.current = true;
    // 切换节点时回到配置 Tab，避免停留在上一节点的结果页
    setActiveTab('config');
    setResponseFullscreen(false);
  }, [selectedNodeId, mappingSignature]);

  // 输入映射即时保存：编辑防抖后校验并写入
  useEffect(() => {
    if (!selectedNode) return undefined;
    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') return undefined;
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return undefined;
    }

    const timer = setTimeout(() => {
      const preparedMappings = mappings.reduce((result, mapping, index) => {
        if (isEmptyMapping(mapping)) return result;
        result.push({
          index,
          mapping: {
            name: mapping.name.trim(),
            source: mapping.source.kind === 'flow'
              ? { kind: 'flow', expression: mapping.source.expression.trim() }
              : {
                  kind: 'literal',
                  value: mapping.source.value,
                  valueType: mapping.source.valueType || 'string'
                }
          }
        });
        return result;
      }, []);

      const errors = validateInputMappings(preparedMappings.map(({ mapping }) => mapping));
      if (errors.length > 0) {
        setMappingErrors(Object.fromEntries(
          errors.map(({ index, error }) => [preparedMappings[index].index, error])
        ));
        return;
      }

      setMappingErrors({});
      const sanitized = preparedMappings.map(({ mapping }) => mapping);
      // 内容未变化则跳过写入，避免 Redux 回写触发循环
      if (JSON.stringify(sanitized) === latestSignatureRef.current) return;
      onUpdateInputs?.(selectedNode.id, sanitized);
    }, AUTOSAVE_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [mappings, selectedNode, onUpdateInputs]);

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

  const updateMapping = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index ? { ...mapping, ...updates } : mapping
    )));
  };

  const updateMappingSource = (index, updates) => {
    setMappings((currentMappings) => currentMappings.map((mapping, mappingIndex) => (
      mappingIndex === index
        ? { ...mapping, source: { ...mapping.source, ...updates } }
        : mapping
    )));
  };

  const handleSourceKindChange = (index, kind) => {
    updateMapping(index, {
      source: kind === 'flow'
        ? { kind: 'flow', expression: '' }
        : { kind: 'literal', value: '', valueType: 'string' }
    });
  };

  const handleLiteralTypeChange = (index, valueType) => {
    updateMappingSource(index, {
      valueType,
      value: valueType === 'null' ? null : ''
    });
  };

  // 结果 Tab 状态徽标信息
  const getRunStatusInfo = (status) => {
    switch (status) {
      case 'running':
        return { bg: STATUS_BADGE_BG.running, color: STATUS_COLORS.running, label: '运行中' };
      case 'success':
        return { bg: STATUS_BADGE_BG.success, color: STATUS_COLORS.success, label: '成功' };
      case 'failed':
        return { bg: STATUS_BADGE_BG.failed, color: STATUS_COLORS.failed, label: '失败' };
      case 'cancelled':
        return { bg: STATUS_BADGE_BG.cancelled, color: STATUS_COLORS.cancelled, label: '已取消' };
      case 'skipped':
        return { bg: STATUS_BADGE_BG.skipped, color: STATUS_COLORS.skipped, label: '已跳过' };
      default:
        return null;
    }
  };

  const formatJson = (data) => {
    if (data === null || data === undefined) return 'null';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const hasDownstreamNode = (stepId) => {
    if (!edges) return false;
    return edges.some((e) => e.source === stepId && e.target !== 'end');
  };

  const renderResultTab = () => {
    if (!selectedNode) {
      return <EmptyContent>选择一个节点查看运行结果</EmptyContent>;
    }

    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') {
      return <EmptyContent>Start / End 节点不产生运行结果</EmptyContent>;
    }

    const runState = flowRun?.nodes?.[selectedNode.id];
    if (!runState || runState.status === 'idle') {
      return <EmptyContent>该节点尚未运行，点击顶栏「运行」或「单跑此节点」开始</EmptyContent>;
    }

    const statusInfo = getRunStatusInfo(runState.status);
    const requestSent = runState.requestSent;

    return (
      <>
        <ResultStatusRow>
          {statusInfo && (
            <StatusBadge $bg={statusInfo.bg} $color={statusInfo.color}>
              {runState.status === 'running' && <SpinningIcon size={12} />}
              {statusInfo.label}
            </StatusBadge>
          )}
          {runState.duration !== null && runState.duration !== undefined && (
            <ResultMeta>{runState.duration}ms</ResultMeta>
          )}
          {runState.httpStatus !== null && runState.httpStatus !== undefined && (
            <HttpStatusText $color={runState.httpStatus < 400 ? STATUS_COLORS.success : STATUS_COLORS.failed}>
              HTTP {runState.httpStatus}
            </HttpStatusText>
          )}
        </ResultStatusRow>

        {runState.error && (
          <DetailSection>
            <DetailTitle>错误</DetailTitle>
            <ErrorText>{runState.error}</ErrorText>
          </DetailSection>
        )}

        {requestSent && (
          <DetailSection>
            <DetailTitle>请求预览</DetailTitle>
            <RequestPreview>
              <summary>
                {requestSent.method ? `${requestSent.method} ` : ''}
                {requestSent.url || '(未记录 URL)'}
              </summary>
              <PreviewBody>
                <DetailTable>
                  <tbody>
                    {requestSent.url && (
                      <tr>
                        <td>URL</td>
                        <td>{requestSent.url}</td>
                      </tr>
                    )}
                    {requestSent.headers && Object.entries(requestSent.headers).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td>{String(value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DetailTable>
              </PreviewBody>
            </RequestPreview>
          </DetailSection>
        )}

        {runState.inputVariables && Object.keys(runState.inputVariables).length > 0 && (
          <DetailSection>
            <DetailTitle>输入变量</DetailTitle>
            <DetailTable>
              <tbody>
                {Object.entries(runState.inputVariables).map(([key, value]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{formatJson(value)}</td>
                  </tr>
                ))}
              </tbody>
            </DetailTable>
          </DetailSection>
        )}

        {runState.body !== null && runState.body !== undefined && (
          <DetailSection>
            <DetailTitleRow>
              <DetailTitle>响应体</DetailTitle>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {onQuickMap && hasDownstreamNode(selectedNode.id) && (
                  <QuickMapButton
                    onClick={() => onQuickMap(selectedNode.id)}
                    title="为此节点的下游节点创建响应映射"
                  >
                    <IconArrowRight size={12} />
                    映射到下游
                  </QuickMapButton>
                )}
                <QuickMapButton
                  onClick={() => setResponseFullscreen(true)}
                  title="全屏查看响应"
                >
                  <IconMaximize size={12} />
                  全屏
                </QuickMapButton>
              </div>
            </DetailTitleRow>
            <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
              <FlowResponseView
                requestItem={requestItem}
                collection={collection}
                runState={runState}
              />
            </div>
          </DetailSection>
        )}

        {responseFullscreen && (
          <ResponseFullscreen>
            <ResponseFullscreenHeader>
              <span>响应 · {selectedNode.data?.alias || selectedNode.id}</span>
              <IconButton
                onClick={() => setResponseFullscreen(false)}
                title="退出全屏"
                aria-label="退出全屏"
              >
                <IconMinimize size={16} />
              </IconButton>
            </ResponseFullscreenHeader>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <FlowResponseView
                requestItem={requestItem}
                collection={collection}
                runState={runState}
              />
            </div>
          </ResponseFullscreen>
        )}
      </>
    );
  };

  const renderConfigTab = () => {
    if (!selectedNode) {
      return <EmptyContent>选择一个节点查看配置</EmptyContent>;
    }

    const nodeData = selectedNode.data || {};
    const nodeType = nodeData.type || selectedNode.type;

    if (nodeType === 'start' || nodeType === 'end') {
      return (
        <>
          <SectionTitle>
            {nodeType === 'start' ? 'Start 节点' : 'End 节点'}
          </SectionTitle>
          <MutedText>
            此节点不可编辑
          </MutedText>
        </>
      );
    }

    // 跳转目标候选：除自身外的全部请求节点
    const jumpTargetOptions = (nodes || []).filter(
      (n) => n.type === 'request' && n.id !== selectedNode.id
    );

    return (
      <>
        <div style={{ marginBottom: 12 }}>
          <InputLabel>
            别名 (Alias)
          </InputLabel>
          <SidebarInput
            value={nodeData.alias || ''}
            onChange={(event) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: event.target.value })}
            placeholder="输入别名"
            aria-label="别名 (Alias)"
          />
        </div>

        {/* 错误处理配置 */}
        <div style={{ marginBottom: 16 }}>
          <MappingHeader>
            <SectionTitle style={{ marginBottom: 0 }}>
              错误处理
            </SectionTitle>
          </MappingHeader>
          <MappingField style={{ marginTop: 0 }}>
            <InputLabel>失败策略</InputLabel>
            <SidebarSelect
              value={nodeData.errorHandler?.strategy || 'stop'}
              onChange={(event) => {
                const strategy = event.target.value;
                const updates = { errorHandler: { strategy } };
                if (strategy === 'stop') {
                  updates.errorHandler = null; // 默认行为无需存储
                }
                onUpdateNode && onUpdateNode(selectedNode.id, updates);
              }}
              aria-label="失败处理策略"
            >
              <option value="stop">终止流程（默认）</option>
              <option value="continue">忽略错误，继续执行</option>
              <option value="jump">跳转到指定节点</option>
            </SidebarSelect>
          </MappingField>

          {nodeData.errorHandler?.strategy === 'jump' && (
            <MappingField>
              <InputLabel>跳转目标节点</InputLabel>
              <SidebarSelect
                value={nodeData.errorHandler?.jumpToNodeId || ''}
                onChange={(event) => {
                  onUpdateNode && onUpdateNode(selectedNode.id, {
                    errorHandler: {
                      strategy: 'jump',
                      jumpToNodeId: event.target.value || null
                    }
                  });
                }}
                aria-label="跳转目标节点"
              >
                <option value="">请选择节点</option>
                {jumpTargetOptions.map((n) => (
                  <option key={n.id} value={n.id}>{n.alias || n.id}</option>
                ))}
              </SidebarSelect>
              {jumpTargetOptions.length === 0 && (
                <MutedText style={{ marginTop: 4 }}>流程中暂无其他请求节点可跳转</MutedText>
              )}
            </MappingField>
          )}
        </div>

        {/* 请求操作：请求配置（url/body/headers 等）在标准请求 Tab 中编辑 */}
        <div style={{ marginBottom: 16 }}>
          <MappingHeader>
            <SectionTitle style={{ marginBottom: 0 }}>
              请求
            </SectionTitle>
          </MappingHeader>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ActionButton onClick={() => onEditRequest && onEditRequest(nodeData)}>
              <IconPencil size={14} />
              编辑请求
            </ActionButton>
            <ActionButton onClick={() => onDuplicateRequest && onDuplicateRequest(nodeData)}>
              <IconCopy size={14} />
              复制请求
            </ActionButton>
            <ActionButton $danger onClick={() => onDeleteRequest && onDeleteRequest(nodeData)}>
              <IconTrash size={14} />
              删除请求
            </ActionButton>
          </div>
        </div>

        <div>
          <MappingHeader>
            <SectionTitle style={{ marginBottom: 0 }}>
              输入映射
            </SectionTitle>
            <MappingButton
              onClick={() => setMappings((currentMappings) => [...currentMappings, createEmptyMapping()])}
              title="添加输入映射（自动保存）"
              aria-label="添加输入映射"
            >
              <IconPlus size={14} />
              添加
            </MappingButton>
          </MappingHeader>

          {mappings.length === 0 ? (
            <EmptyMappings>
              暂无输入映射
            </EmptyMappings>
          ) : (
            mappings.map((mapping, index) => {
              const error = mappingErrors[index];
              const isFlowSource = mapping.source.kind === 'flow';
              const isNullLiteral = mapping.source.valueType === 'null';
              const isExprExpanded = expandedExprIndex === index;

              return (
                <MappingRow key={`${selectedNode.id}-${index}`}>
                  <MappingRowHeader>
                    <InputLabel style={{ marginBottom: 0 }}>映射 {index + 1}</InputLabel>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {error && (
                        <UnsavedMark title="校验未通过，修正后自动保存">未保存</UnsavedMark>
                      )}
                      <IconButton
                        $danger
                        onClick={() => setMappings((currentMappings) => currentMappings.filter((_, mappingIndex) => mappingIndex !== index))}
                        title="删除输入映射"
                        aria-label={`删除输入映射 ${index + 1}`}
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    </div>
                  </MappingRowHeader>

                  <MappingField>
                    <InputLabel>变量名</InputLabel>
                    <SidebarInput
                      value={mapping.name}
                      onChange={(event) => updateMapping(index, { name: event.target.value })}
                      placeholder="例如 supplierId"
                      aria-label={`映射 ${index + 1} 变量名`}
                    />
                  </MappingField>

                  <MappingField>
                    <InputLabel>来源</InputLabel>
                    <SidebarSelect
                      value={mapping.source.kind}
                      onChange={(event) => handleSourceKindChange(index, event.target.value)}
                      aria-label={`映射 ${index + 1} 来源`}
                    >
                      <option value="flow">Flow 响应</option>
                      <option value="literal">字面量</option>
                    </SidebarSelect>
                  </MappingField>

                  {isFlowSource ? (
                    <MappingField>
                      <InputLabel>表达式</InputLabel>
                      <div style={{ display: 'flex', gap: 4, alignItems: isExprExpanded ? 'flex-start' : 'center' }}>
                        {isExprExpanded ? (
                          <SidebarTextarea
                            value={mapping.source.expression || ''}
                            onChange={(event) => updateMappingSource(index, { expression: event.target.value })}
                            placeholder="{{$flow.step_x.body.id}}"
                            aria-label={`映射 ${index + 1} Flow 表达式（展开编辑）`}
                            style={{ flex: 1 }}
                            autoFocus
                          />
                        ) : (
                          <SidebarInput
                            value={mapping.source.expression || ''}
                            onChange={(event) => updateMappingSource(index, { expression: event.target.value })}
                            placeholder="{{$flow.step_x.body.id}}"
                            aria-label={`映射 ${index + 1} Flow 表达式`}
                            style={{ flex: 1 }}
                          />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <MappingButton
                            onClick={() => setFlowResponsePickerOpenIndex(index)}
                            title="从响应选取字段"
                            aria-label="从响应选取字段"
                          >
                            <IconCode size={14} />
                          </MappingButton>
                          <MappingButton
                            onClick={() => setExpandedExprIndex(isExprExpanded ? null : index)}
                            title={isExprExpanded ? '收起表达式编辑' : '展开表达式编辑'}
                            aria-label={isExprExpanded ? '收起表达式编辑' : '展开表达式编辑'}
                          >
                            {isExprExpanded ? <IconMinimize size={14} /> : <IconMaximize size={14} />}
                          </MappingButton>
                        </div>
                      </div>
                    </MappingField>
                  ) : (
                    <>
                      <MappingField>
                        <InputLabel>字面量类型</InputLabel>
                        <SidebarSelect
                          value={mapping.source.valueType || 'string'}
                          onChange={(event) => handleLiteralTypeChange(index, event.target.value)}
                          aria-label={`映射 ${index + 1} 字面量类型`}
                        >
                          {LITERAL_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </SidebarSelect>
                      </MappingField>
                      {!isNullLiteral && (
                        <MappingField>
                          <InputLabel>字面量值</InputLabel>
                          <SidebarInput
                            value={mapping.source.value == null ? '' : String(mapping.source.value)}
                            onChange={(event) => updateMappingSource(index, { value: event.target.value })}
                            placeholder={mapping.source.valueType === 'json' ? '{"id": 1}' : '输入值'}
                            aria-label={`映射 ${index + 1} 字面量值`}
                          />
                        </MappingField>
                      )}
                    </>
                  )}

                  {error && <MappingError role="alert">{error}</MappingError>}
                </MappingRow>
              );
            })
          )}
        </div>
      </>
    );
  };

  if (collapsed) {
    return (
      <WorkbenchRoot>
        <CollapsedBar>
          <CollapseButton onClick={toggleCollapsed} title="展开工作台" aria-label="展开工作台">
            <IconChevronLeft size={16} />
          </CollapseButton>
        </CollapsedBar>
      </WorkbenchRoot>
    );
  }

  // 结果 Tab 上的状态点
  const selectedRunStatus = selectedNodeId ? flowRun?.nodes?.[selectedNodeId]?.status : null;
  const tabDotColor = selectedRunStatus ? getStatusColor(selectedRunStatus) : null;

  return (
    <WorkbenchRoot>
      <ResizeHandle
        onMouseDown={handleResizeStart}
        title="拖拽调整工作台宽度"
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
          <div style={{ marginLeft: 'auto' }}>
            <CollapseButton onClick={toggleCollapsed} title="折叠工作台" aria-label="折叠工作台">
              <IconChevronRight size={16} />
            </CollapseButton>
          </div>
        </TabHeader>
        <TabBody>
          {activeTab === 'config' ? renderConfigTab() : renderResultTab()}
        </TabBody>
      </WorkbenchContainer>

      {flowResponsePickerOpenIndex !== null && selectedNode && (
        <FlowResponsePicker
          flowRun={flowRun}
          edges={edges}
          selectedNodeId={selectedNode.id}
          nodes={nodes}
          onClose={() => setFlowResponsePickerOpenIndex(null)}
          onInsertExpression={(expression) => {
            updateMappingSource(flowResponsePickerOpenIndex, { expression });
          }}
        />
      )}
    </WorkbenchRoot>
  );
};

export default FlowWorkbench;
