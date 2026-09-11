/**
 * FlowTab 共享常量——运行状态色、HTTP 方法色。
 *
 * 统一在此定义，避免各组件硬编码 hex 导致主题间不一致。
 */

export const STATUS_COLORS = {
  running: '#3b82f6',
  success: '#22c55e',
  failed: '#ef4444',
  cancelled: '#f59e0b',
  skipped: '#94a3b8',
  idle: '#64748b'
};

export const getStatusColor = (status, fallback = '#64748b') => STATUS_COLORS[status] || fallback;

export const METHOD_COLORS = {
  GET: '#3b82f6',
  POST: '#22c55e',
  PUT: '#f59e0b',
  PATCH: '#a855f7',
  DELETE: '#ef4444',
  HEAD: '#64748b',
  OPTIONS: '#64748b'
};

export const getMethodColor = (method) => METHOD_COLORS[String(method || '').toUpperCase()] || '#64748b';

// 侧边栏宽度约束（px）
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_DEFAULT_WIDTH = 280;
export const SIDEBAR_WIDTH_STORAGE_KEY = 'bruno.flowSidebarWidth';
export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'bruno.flowSidebarCollapsed';
export const RUN_PANEL_COLLAPSED_STORAGE_KEY = 'bruno.flowRunPanelCollapsed';

const OPERATOR_SYMBOLS = {
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: '包含',
  regex: '匹配'
};

/**
 * 生成边条件的可读摘要（用于画布边标签）。
 */
export const summarizeCondition = (condition) => {
  if (!condition) return '';
  if (condition.expression) return condition.expression;
  const op = OPERATOR_SYMBOLS[condition.operator] || condition.operator || '';
  const value = condition.value === null || condition.value === undefined ? '' : String(condition.value);
  return `${condition.field || ''} ${op} ${value}`.trim();
};

/**
 * 截断长文本用于边标签展示。
 */
export const truncateLabel = (text, max = 20) => {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
