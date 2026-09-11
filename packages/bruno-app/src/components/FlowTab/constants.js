/**
 * FlowTab 共享常量——运行状态色、HTTP 方法色、布局尺寸。
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

// 状态徽标的浅色背景（与 STATUS_COLORS 一一对应）
export const STATUS_BADGE_BG = {
  running: 'rgba(59,130,246,0.15)',
  success: 'rgba(34,197,94,0.15)',
  failed: 'rgba(239,68,68,0.15)',
  cancelled: 'rgba(245,158,11,0.15)',
  skipped: 'rgba(148,163,184,0.15)'
};

// JSON 语法高亮色（响应字段选取器的 JSON 树）
export const JSON_TOKEN_COLORS = {
  string: '#22c55e',
  number: '#3b82f6',
  boolean: '#a855f7',
  null: '#94a3b8'
};

// 节点卡片错误处理策略徽标（默认 stop 不显示）
export const STRATEGY_BADGE = {
  continue: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  jump: { bg: 'rgba(168,85,247,0.15)', color: '#a855f7' }
};

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

// 节点工作台（右侧面板）尺寸约束（px）
export const WORKBENCH_MIN_WIDTH = 320;
export const WORKBENCH_DEFAULT_WIDTH = 420;
// 可拖拽上限：视口宽度的 60%
export const WORKBENCH_MAX_VIEWPORT_RATIO = 0.6;
export const WORKBENCH_WIDTH_STORAGE_KEY = 'bruno.flowWorkbenchWidth';
export const WORKBENCH_COLLAPSED_STORAGE_KEY = 'bruno.flowWorkbenchCollapsed';

// 底部运行条
export const RUN_BAR_HEIGHT = 36;
// 展开态默认高度：视口高度的 40%
export const RUN_BAR_DEFAULT_EXPANDED_RATIO = 0.4;
export const RUN_BAR_MIN_EXPANDED_HEIGHT = 120;
export const RUN_BAR_COLLAPSED_STORAGE_KEY = 'bruno.flowRunBarCollapsed';
export const RUN_BAR_EXPANDED_HEIGHT_STORAGE_KEY = 'bruno.flowRunBarExpandedHeight';

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
