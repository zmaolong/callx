/**
 * Flow 表达式解析与求值
 *
 * 处理 `{{$flow.<stepId>.body...}}` 和 `{{$flow.last.body...}}` 格式的表达式。
 * 所有函数都是纯函数。
 */
import get from 'lodash/get';

/**
 * 解析 Flow 表达式，提取 stepId 和路径。
 *
 * 支持的格式：
 * - `{{$flow.<stepId>.body...}}` — 指定 stepId
 * - `{{$flow.last.body...}}` — 上一个已执行节点
 *
 * 规则：
 * - 必须是完整单一表达式，即整个字符串为 `{{...}}` 形式
 * - 混合模板（如 `token-{{$flow.step.body.id}}`）不被支持
 *
 * @param {string} expression 完整表达式字符串
 * @returns {{ stepId: string, path: string } | null} 解析结果，不合法返回 null
 */
export function parseFlowExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    return null;
  }

  const trimmed = expression.trim();

  // 必须被 {{ 和 }} 完全包裹
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) {
    return null;
  }

  const inner = trimmed.slice(2, -2).trim();

  // 必须以 $flow. 开头
  if (!inner.startsWith('$flow.')) {
    return null;
  }

  const rest = inner.slice('$flow.'.length);

  // 至少需要 stepId 和 body 两部分：stepId.body
  const dotIndex = rest.indexOf('.');
  if (dotIndex === -1) {
    return null;
  }

  const stepId = rest.slice(0, dotIndex);
  const path = rest.slice(dotIndex + 1); // 包含 "body..." 部分

  if (!stepId) {
    return null;
  }

  // path 必须以 "body" 开头
  if (!path.startsWith('body')) {
    return null;
  }

  return { stepId, path };
}

/**
 * 校验 Flow 表达式是否合法。
 *
 * @param {string} expression
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFlowExpression(expression) {
  if (!expression || typeof expression !== 'string') {
    return { valid: false, error: '表达式不能为空' };
  }

  const trimmed = expression.trim();

  // 必须被 {{ 和 }} 完全包裹
  if (!trimmed.startsWith('{{') || !trimmed.endsWith('}}')) {
    return { valid: false, error: '表达式必须被 {{ 和 }} 包裹' };
  }

  // 检查是否有多余内容（混合模板）
  // 如果 {{ 前有内容，或 }} 后有内容，则是混合模板
  const trimmedForMixed = expression.trim();
  const openIndex = trimmedForMixed.indexOf('{{');
  const closeIndex = trimmedForMixed.lastIndexOf('}}');
  if (openIndex !== 0 || closeIndex !== trimmedForMixed.length - 2) {
    return { valid: false, error: '不支持混合模板，表达式必须是完整的单一 {{...}} 形式' };
  }

  const inner = trimmed.slice(2, -2).trim();

  if (!inner.startsWith('$flow.')) {
    return { valid: false, error: 'Flow 表达式必须以 $flow. 开头' };
  }

  const rest = inner.slice('$flow.'.length);

  const dotIndex = rest.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, error: 'Flow 表达式必须包含 stepId 和路径，格式为 $flow.<stepId>.<path>' };
  }

  const stepId = rest.slice(0, dotIndex);
  if (!stepId) {
    return { valid: false, error: 'stepId 不能为空' };
  }

  const path = rest.slice(dotIndex + 1);
  if (!path.startsWith('body')) {
    return { valid: false, error: 'Flow 表达式路径必须以 body 开头' };
  }

  return { valid: true };
}

/**
 * 在 flowContext 中查找对应 stepId 的响应 body，用 lodash _.get 深路径取值。
 *
 * flowContext 结构：
 * {
 *   [stepId]: {
 *     body: any,       // 响应 body（JSON 已解析为对象/数组，或字符串）
 *     status: number,
 *     duration: number
 *   }
 * }
 *
 * @param {string} expression 完整表达式（如 `{{$flow.step_abc.body.user.id}}`）
 * @param {Object} flowContext Flow 运行上下文
 * @param {Object} options
 * @param {function} [options.getPredecessorStepId] 获取前驱 stepId 的函数（用于 $flow.last）
 * @returns {{ value: any, stepId: string } | null}
 */
export function evaluateFlowExpression(expression, flowContext, options = {}) {
  const parsed = parseFlowExpression(expression);
  if (!parsed) {
    return null;
  }

  let { stepId, path } = parsed;

  // 处理 $flow.last 虚拟 ID
  if (stepId === 'last') {
    // 需要从 path 中提取 body 后面的路径，但 last 指向的是前驱节点
    // 如果 path 是 "body.token"，则前驱节点的 body.token
    // 对于 last，我们需要知道当前节点是谁，但这里没有上下文
    // 因此 last 的解析需要调用方提供 getPredecessorStepId
    // 或者我们假设 path 已经包含了 body 前缀
    // 实际上，path 在这里是 "body.token" 这样的格式

    // 调用外部传入的 getPredecessorStepId 函数来获取实际 stepId
    if (options.getPredecessorStepId) {
      // 注意：这里需要调用方提供当前节点 ID
      // 但由于表达式本身不包含当前节点 ID，由调用方在 resolveInputMappings 中处理
      // 在此函数中，我们只解析表达式
      return null; // 调用方应该单独处理 $flow.last
    }
    return null;
  }

  const stepContext = flowContext[stepId];
  if (!stepContext) {
    return null;
  }

  // 路径格式为 "body.x.y.z"，用 lodash get 取值
  const value = get(stepContext, path, undefined);

  return { value, stepId };
}

/**
 * 处理 $flow.last 表达式的专用函数。
 *
 * @param {string} currentStepId 当前节点 ID
 * @param {function} getPredecessor 获取前驱 stepId 的函数
 * @param {Object} flowContext
 * @param {string} path 完整路径（如 "body.token"）
 * @returns {{ value: any, stepId: string } | null}
 */
export function evaluateLastExpression(currentStepId, getPredecessor, flowContext, path) {
  const predecessorId = getPredecessor(currentStepId);
  if (!predecessorId) {
    return null;
  }

  const stepContext = flowContext[predecessorId];
  if (!stepContext) {
    return null;
  }

  const value = get(stepContext, path, undefined);
  return { value, stepId: predecessorId };
}

/**
 * 评估边的条件是否满足。
 *
 * @param {Object} condition 条件对象 { field, operator, value, expression? }
 * @param {Object} flowContext Flow 运行上下文
 * @returns {boolean} 是否满足条件
 */
export function evaluateCondition(condition, flowContext) {
  if (!condition) return true; // 无条件（默认分支）

  // 如果有 expression 字段，直接 JS eval 求值
  if (condition.expression) {
    try {
      return new Function('context', `return (${condition.expression})`)(flowContext);
    } catch {
      return false;
    }
  }

  const actualValue = get(flowContext, condition.field, undefined);

  switch (condition.operator) {
    case 'eq':
      return actualValue == condition.value;
    case 'ne':
      return actualValue != condition.value;
    case 'gt':
      return actualValue > condition.value;
    case 'gte':
      return actualValue >= condition.value;
    case 'lt':
      return actualValue < condition.value;
    case 'lte':
      return actualValue <= condition.value;
    case 'contains':
      if (typeof actualValue === 'string' && typeof condition.value === 'string') {
        return actualValue.includes(condition.value);
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(condition.value);
      }
      return false;
    case 'regex':
      if (typeof actualValue === 'string' && typeof condition.value === 'string') {
        try {
          return new RegExp(condition.value).test(actualValue);
        } catch {
          return false;
        }
      }
      return false;
    default:
      return false;
  }
}

/**
 * 从一组出边中选取第一条满足条件的边。
 *
 * @param {Array} outgoingEdges 出边列表（每条边可选有 condition）
 * @param {Object} flowContext
 * @returns {Object|null} 选中的边对象，或 null（无可走边）
 */
export function selectBranch(outgoingEdges, flowContext) {
  if (!outgoingEdges || outgoingEdges.length === 0) return null;

  // 先走有条件且匹配的边
  for (const edge of outgoingEdges) {
    if (edge.condition && evaluateCondition(edge.condition, flowContext)) {
      return edge;
    }
  }

  // 再走无条件（默认）边
  const defaultEdge = outgoingEdges.find((e) => !e.condition);
  if (defaultEdge) return defaultEdge;

  // 无默认边，返回 null（流程终止）
  return null;
}
