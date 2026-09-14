/**
 * FlowWorkbench 共享样式与工具。
 *
 * 从 FlowWorkbench.js 拆出：所有 styled-components、映射编辑的纯函数工具、
 * 状态徽标/历史条目的展示辅助。拆分仅移动代码，不改任何行为。
 */
import styled, { keyframes } from 'styled-components';
import { IconRefresh } from '@tabler/icons';
import { STATUS_COLORS, STATUS_BADGE_BG } from '../constants';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

export const SpinningIcon = styled(IconRefresh)`
  animation: ${spin} 1s linear infinite;
`;

export const WorkbenchRoot = styled.div`
  display: flex;
  flex-shrink: 0;
  height: 100%;
`;

export const ResizeHandle = styled.div`
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

export const WorkbenchContainer = styled.div`
  width: ${(props) => props.$width}px;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
  flex-shrink: 0;
  min-height: 0;
`;

export const TabHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 8px 0 8px;
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
  flex-shrink: 0;
`;

export const TabButton = styled.button`
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

export const TabStatusDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => props.$color};
  flex-shrink: 0;
`;

export const TabBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
`;

/* ---------- 表单通用 ---------- */

export const InputLabel = styled.label`
  display: block;
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  margin-bottom: 4px;
`;

export const SidebarInput = styled.input`
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

export const SidebarTextarea = styled(SidebarInput)`
  resize: vertical;
  min-height: 60px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
`;

export const SidebarSelect = styled.select`
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

export const SectionTitle = styled.div`
  font-weight: 600;
  font-size: 13px;
  color: ${(props) => props.theme.text};
  margin-bottom: 8px;
`;

export const MutedText = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
`;

export const EmptyContent = styled.div`
  color: ${(props) => props.theme.colors.text.muted};
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
`;

export const ActionButton = styled.button`
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

export const MappingHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`;

export const MappingButton = styled.button`
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

export const MappingRow = styled.div`
  padding: 8px;
  margin-bottom: 8px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
`;

export const MappingRowHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
`;

export const MappingField = styled.div`
  margin-top: 6px;
`;

export const MappingError = styled.div`
  margin-top: 6px;
  color: ${(props) => props.theme.status.danger.text};
  font-size: 11px;
  line-height: 1.35;
`;

export const IconButton = styled.button`
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

export const EmptyMappings = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  font-style: italic;
`;

/* ---------- 结果 Tab ---------- */

export const ResultStatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`;

export const StatusBadge = styled.span`
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

export const ResultMeta = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
`;

export const HttpStatusText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => props.$color};
`;

export const DetailSection = styled.div`
  margin-bottom: 14px;
`;

export const DetailTitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`;

export const DetailTitle = styled.div`
  font-weight: 600;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

export const DetailTable = styled.table`
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

export const ErrorText = styled.div`
  padding: 6px 8px;
  background: ${(props) => props.theme.status.danger?.background || 'rgba(239,68,68,0.1)'};
  border: 1px solid ${(props) => props.theme.status.danger?.text || '#ef4444'};
  border-radius: 4px;
  color: ${(props) => props.theme.status.danger?.text || '#ef4444'};
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
`;

export const AssertionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

export const AssertionRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px;
  border-radius: 4px;
  background: ${(props) => props.$failed
    ? props.theme.status.danger?.background || 'rgba(239,68,68,0.08)'
    : props.theme.status.success?.background || 'rgba(34,197,94,0.08)'};
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
`;

export const AssertionRowHead = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${(props) => props.theme.text};
  word-break: break-all;
`;

export const AssertionStatusDot = styled.span`
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => props.$failed
    ? props.theme.status.danger?.text || '#ef4444'
    : props.theme.status.success?.text || '#22c55e'};
`;

export const AssertionExpr = styled.span`
  flex: 1;
  min-width: 0;
`;

export const AssertionErrorText = styled.span`
  color: ${(props) => props.theme.status.danger?.text || '#ef4444'};
  font-size: 11px;
  word-break: break-all;
`;

export const QuickMapButton = styled.button`
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

export const HistoryRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
`;

export const HistorySelect = styled.select`
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: 4px;
  background: ${(props) => props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 12px;
  cursor: pointer;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.border.border2};
  }
`;

// 运行总览步骤列表
export const OverviewSteps = styled.div`
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  overflow: hidden;
`;

export const OverviewStepRow = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: ${(props) => props.theme.text};
  text-align: left;

  & + & {
    border-top: 1px solid ${(props) => props.theme.border.border1};
  }

  &:hover {
    background: ${(props) => props.theme.background.surface1};
  }

  ${(props) => props.$active && `
    background: ${props.theme.background.surface1};
    border-left-color: ${props.theme.colors?.accent || '#3b82f6'};
  `}

  ${(props) => props.$failed && `
    border-left-color: ${props.theme.status?.danger?.text || '#ef4444'};
  `}
`;

export const StepStatusText = styled.span`
  min-width: 40px;
  color: ${(props) => props.$color};
  font-weight: 600;
  flex-shrink: 0;
`;

export const StepNameText = styled.span`
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 40%;
`;

export const StepErrorText = styled.span`
  flex: 1;
  min-width: 0;
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StepDurationText = styled.span`
  margin-left: auto;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  flex-shrink: 0;
`;

export const StepHttpStatusText = styled.span`
  color: ${(props) => (props.$ok ? STATUS_COLORS.success : STATUS_COLORS.failed)};
  font-weight: 600;
  flex-shrink: 0;
`;

// 请求预览折叠块
export const RequestPreview = styled.details`
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

export const PreviewBody = styled.div`
  padding: 8px;
`;

// 响应体全屏浮层：absolute 相对 Flow Tab 根容器，避免盖住软件标题栏按钮
export const ResponseFullscreen = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.background.base};
  padding: 16px;
`;

export const ResponseFullscreenHeader = styled.div`
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

export const UnsavedMark = styled.span`
  font-size: 10px;
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
`;

/* ---------- 循环节点轮次明细 ---------- */

export const RoundItem = styled.details`
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  font-size: 12px;
  margin-bottom: 4px;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    cursor: pointer;
    user-select: none;
    color: ${(props) => props.theme.text};
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }

  &[open] summary {
    border-bottom: 1px solid ${(props) => props.theme.border.border1};
  }
`;

export const RoundStatusDot = styled.span`
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${(props) => (props.$failed
    ? props.theme.status.danger?.text || '#ef4444'
    : props.theme.status.success?.text || '#22c55e')};
`;

export const RoundIndex = styled.span`
  flex-shrink: 0;
  font-weight: 600;
`;

export const RoundItemText = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
`;

export const RoundMeta = styled.span`
  flex-shrink: 0;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
`;

export const RoundError = styled.div`
  padding: 4px 8px;
  color: ${(props) => props.theme.status.danger?.text || '#ef4444'};
  font-size: 11px;
  line-height: 1.4;
  word-break: break-all;
`;

/* ---------- 逻辑常量与工具 ---------- */

export const LITERAL_TYPES = [
  { value: 'string', label: '字符串' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'json', label: 'JSON' },
  { value: 'null', label: 'Null' }
];

export const createEmptyMapping = () => ({
  name: '',
  source: {
    kind: 'flow',
    expression: ''
  }
});

export const normalizeMapping = (mapping) => {
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

export const isEmptyMapping = (mapping) => {
  if (mapping.name.trim()) return false;
  if (mapping.source.kind === 'flow') return !mapping.source.expression?.trim();
  return mapping.source.valueType !== 'null' && String(mapping.source.value ?? '').trim() === '';
};

export const getMappingsFromNode = (selectedNode) => (selectedNode?.data?.inputs || []).map(normalizeMapping);

// 输入映射即时保存防抖时长（ms）
export const AUTOSAVE_DEBOUNCE = 400;

/**
 * 历史记录下拉项文案：时间 + 状态 + 总耗时
 */
export const formatHistoryLabel = (meta) => {
  const d = new Date(meta.startedAt || 0);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const statusLabel = meta.status === 'success' ? '成功' : meta.status === 'cancelled' ? '已取消' : '失败';
  const duration = meta.durationMs ? ` ${meta.durationMs}ms` : '';
  const trigger = meta.trigger === 'stop-at' ? ' 到此' : '';
  return `${time} ${statusLabel}${trigger}${duration}`;
};

/**
 * 节点/流程状态徽标信息（bg、color、中文标签）。
 */
export const getRunStatusInfo = (status) => {
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

export const getFlowStatusInfo = (status) => {
  const info = getRunStatusInfo(status);
  // Flow 整体状态不含 skipped，其余与节点一致
  return info;
};
