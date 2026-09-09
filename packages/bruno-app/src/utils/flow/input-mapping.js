/**
 * 输入映射解析
 *
 * 负责将卡片输入映射解析为运行时变量。
 * 所有函数都是纯函数，不依赖 Redux 或外部状态。
 */
import get from 'lodash/get';
import {
  parseFlowExpression,
  evaluateFlowExpression,
  evaluateLastExpression,
  validateFlowExpression
} from './expressions';
import { getPredecessorStepId } from './graph';

/**
 * 支持的來源类型
 */
const SOURCE_KINDS = {
  FLOW: 'flow',
  LITERAL: 'literal'
};

/**
 * 字面量类型
 */
const LITERAL_TYPES = [
  'string',
  'number',
  'boolean',
  'json',
  'null'
];

/**
 * 校验单个输入映射的结构。
 *
 * @param {Object} mapping
 * @param {string} mapping.name 变量名
 * @param {Object} mapping.source 來源
 * @param {string} mapping.source.kind 'flow' 或 'literal'
 * @param {string} [mapping.source.expression] flow 来源的表达式
 * @param {*} [mapping.source.value] literal 来源的值
 * @param {string} [mapping.source.valueType] literal 值的类型
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateInputMapping(mapping) {
  if (!mapping) {
    return { valid: false, error: '映射不能为空' };
  }

  if (!mapping.name || typeof mapping.name !== 'string' || !mapping.name.trim()) {
    return { valid: false, error: '变量名不能为空' };
  }

  if (!mapping.source) {
    return { valid: false, error: '映射 source 不能为空' };
  }

  if (mapping.source.kind === SOURCE_KINDS.FLOW) {
    if (!mapping.source.expression || typeof mapping.source.expression !== 'string') {
      return { valid: false, error: 'flow 来源必须提供 expression 字符串' };
    }
    // 验证表达式格式
    const { valid, error } = validateFlowExpression(mapping.source.expression);
    if (!valid) {
      return { valid: false, error: `表达式无效: ${error}` };
    }
  } else if (mapping.source.kind === SOURCE_KINDS.LITERAL) {
    if (mapping.source.value === undefined) {
      return { valid: false, error: 'literal 来源必须提供 value' };
    }
    if (mapping.source.valueType && !LITERAL_TYPES.includes(mapping.source.valueType)) {
      return { valid: false, error: `不支持的 literal 类型: ${mapping.source.valueType}` };
    }
  } else {
    return { valid: false, error: `不支持的来源类型: ${mapping.source.kind}` };
  }

  return { valid: true };
}

/**
 * 校验输入映射列表。
 *
 * @param {Array} mappings
 * @returns {Array<{ index: number, error: string }>}
 */
export function validateInputMappings(mappings) {
  const errors = [];
  if (!Array.isArray(mappings)) {
    return [{ index: -1, error: '映射必须是一个数组' }];
  }

  for (let i = 0; i < mappings.length; i++) {
    const { valid, error } = validateInputMapping(mappings[i]);
    if (!valid) {
      errors.push({ index: i, error });
    }
  }

  return errors;
}

/**
 * 解析单个输入映射，返回解析后的变量名和值。
 *
 * @param {Object} mapping
 * @param {Object} flowContext Flow 运行上下文
 * @param {string} [currentStepId] 当前节点 ID（用于 $flow.last 解析）
 * @returns {{ name: string, value: any, stepId?: string } | { name: string, error: string }}
 */
export function resolveInputMapping(mapping, flowContext, currentStepId) {
  if (mapping.source.kind === SOURCE_KINDS.LITERAL) {
    let value = mapping.source.value;

    // 根据 valueType 转换类型
    if (mapping.source.valueType === 'number') {
      value = Number(value);
    } else if (mapping.source.valueType === 'boolean') {
      value = value === true || value === 'true' || value === 1 || value === '1';
    } else if (mapping.source.valueType === 'null') {
      value = null;
    } else if (mapping.source.valueType === 'json') {
      try {
        value = typeof value === 'string' ? JSON.parse(value) : value;
      } catch {
        return { name: mapping.name, error: `JSON 解析失败: ${mapping.source.value}` };
      }
    }
    // 'string' 类型保持原样

    return { name: mapping.name, value };
  }

  if (mapping.source.kind === SOURCE_KINDS.FLOW) {
    const expression = mapping.source.expression;

    // 检查是否为 $flow.last 表达式
    const parsed = parseFlowExpression(expression);
    if (!parsed) {
      return { name: mapping.name, error: `无法解析表达式: ${expression}` };
    }

    let result;
    if (parsed.stepId === 'last') {
      // 处理 $flow.last
      if (!currentStepId) {
        return { name: mapping.name, error: '$flow.last 需要当前节点 ID 上下文' };
      }

      // 从 path 中提取 body 后面的路径部分
      // path 格式为 "body.x.y"，去掉 "body." 前缀
      const bodyPath = parsed.path.slice('body'.length); // 可能为 ".x.y" 或空字符串
      const fullPath = `body${bodyPath}`;

      result = evaluateLastExpression(
        currentStepId,
        (stepId) => getPredecessorStepId(stepId, flowContext._edges),
        flowContext._nodeResults,
        fullPath
      );
    } else {
      result = evaluateFlowExpression(expression, flowContext._nodeResults);
    }

    if (!result) {
      return {
        name: mapping.name,
        error: `表达式求值失败，无法找到节点 ${parsed.stepId} 的响应数据: ${expression}`
      };
    }

    if (result.value === undefined) {
      return {
        name: mapping.name,
        error: `表达式路径未找到值: ${expression}`
      };
    }

    return { name: mapping.name, value: result.value, stepId: result.stepId };
  }

  return { name: mapping.name, error: `不支持的来源类型: ${mapping.source.kind}` };
}

/**
 * 解析所有输入映射，返回 runtime variables 对象。
 *
 * 映射失败时，返回携带可定位错误的结果。
 *
 * @param {Array} mappings 输入映射列表
 * @param {Object} flowContext Flow 运行上下文
 *   - flowContext._nodeResults: { [stepId]: { body, status, duration } }
 *   - flowContext._edges: Array 边列表
 * @param {string} [currentStepId] 当前节点 ID
 * @returns {{ variables: Object, errors: Array<{ variableName: string, expression?: string, stepId?: string, error: string }> }}
 */
export function resolveInputMappings(mappings, flowContext, currentStepId) {
  const variables = {};
  const errors = [];

  if (!Array.isArray(mappings)) {
    return { variables, errors };
  }

  for (const mapping of mappings) {
    const result = resolveInputMapping(mapping, flowContext, currentStepId);

    if (result.error) {
      errors.push({
        variableName: mapping.name,
        expression: mapping.source?.expression,
        stepId: null,
        error: result.error
      });
    } else {
      variables[result.name] = result.value;
    }
  }

  return { variables, errors };
}

export { SOURCE_KINDS, LITERAL_TYPES };
