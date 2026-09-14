/**
 * Flow 图辅助函数
 *
 * 负责 Flow 图的创建、校验、主链解析和未连接节点识别。
 * 所有函数都是纯函数，不依赖 Redux 或外部状态。
 */
import { customAlphabet } from 'nanoid';
import { validateFlowExpression } from './expressions';

const STEP_ID_ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
const generateStepId = customAlphabet(STEP_ID_ALPHABET, 16);

const NODE_TYPES = {
  START: 'start',
  END: 'end',
  REQUEST: 'request',
  LOOP: 'loop',
  PARALLEL: 'parallel'
};

const EDGE_TYPES = {
  DEFAULT: 'default'
};

// 循环节点边的语义标记（存储在 edge.loopKind）
const LOOP_EDGE_KINDS = {
  BODY: 'body', // 循环体入口（每轮迭代执行的链）
  DONE: 'done', // 循环完成后继续的链
  BACK: 'back' // 循环体尾连回循环节点的回边
};

/**
 * 创建初始 Flow 图，包含 Start 和 End 节点，无连线。
 *
 * @returns {{ nodes: Array, edges: Array }}
 */
export function createFlowGraph() {
  const startId = 'start';
  const endId = 'end';

  return {
    nodes: [
      {
        id: startId,
        type: NODE_TYPES.START,
        position: { x: 80, y: 200 },
        data: { label: 'Start' }
      },
      {
        id: endId,
        type: NODE_TYPES.END,
        position: { x: 920, y: 200 },
        data: { label: 'End' }
      }
    ],
    edges: []
  };
}

/**
 * 为 Request 节点生成稳定的 step ID。
 * 格式：step_<nanoid>
 *
 * @returns {string}
 */
export function generateNodeStepId() {
  return `step_${generateStepId()}`;
}

/**
 * 从 source 和 target 生成稳定的边 ID。
 *
 * @param {string} source
 * @param {string} target
 * @returns {string}
 */
export function generateEdgeId(source, target) {
  return `edge_${source}_${target}`;
}

/**
 * 构建有序执行路径——运行时与校验使用。
 *
 * 从 Start 做 BFS 收集所有可达节点，返回每个节点的出边列表，
 * 供运行时动态评估条件选择分支；环检测使用拓扑排序（允许不等长分支合流）。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {{ stepId: string, outgoingEdges: Array }[]} 有序执行步骤列表
 * @throws {Error}
 */
export function resolveExecutionPath(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 验证 Start 和 End
  if (!nodeMap.has('start')) throw new Error('图缺少 Start 节点');
  if (!nodeMap.has('end')) throw new Error('图缺少 End 节点');

  // 构建出边邻接表
  const outgoingEdges = new Map();
  for (const edge of edges) {
    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source).push(edge);
  }

  // 校验自连接
  for (const edge of edges) {
    if (edge.source === edge.target) {
      throw new Error(`自连接非法：节点 ${edge.source} 连接到自身`);
    }
  }

  // 从 Start 出发，收集所有可达节点（不含 Start/End、不含 parallel 子节点）
  const path = [];
  const visited = new Set();
  const queue = ['start'];
  const childNodeIds = new Set(nodes.filter((n) => n.parentId).map((n) => n.id));

  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    if (current !== 'start' && current !== 'end') {
      path.push({
        stepId: current,
        outgoingEdges: outgoingEdges.get(current) || []
      });
    }

    // 沿着边推进时，parallel 子节点不加入主执行路径
    const out = outgoingEdges.get(current) || [];
    for (const edge of out) {
      if (!visited.has(edge.target) && !childNodeIds.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // 环检测：对可达子图做 Kahn 拓扑排序。
  // 不能用 BFS 序下标判断——合流分支长度不等时，汇合点在 BFS 序中
  // 可能先于长分支尾节点出现，会被误判为环。
  if (path.length > 0) {
    const pathIds = new Set(path.map((p) => p.stepId));
    const loopIds = new Set(nodes.filter((n) => n.type === NODE_TYPES.LOOP).map((n) => n.id));
    // 统计可达子图内各节点的入度（只统计来自可达节点的边；
    // 指向循环节点的边不计数——回边是循环语义的一部分，由循环节点控制器接管，
    // 计入会让"入口→循环节点→循环体→回边"的合法结构被误判为环）
    const inDegree = new Map();
    for (const step of path) {
      if (!inDegree.has(step.stepId)) inDegree.set(step.stepId, 0);
      for (const edge of step.outgoingEdges) {
        if (edge.target !== 'end' && edge.target !== 'start' && pathIds.has(edge.target) && !loopIds.has(edge.target)) {
          inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        }
      }
    }

    // Kahn：入度为 0 的节点逐个移除
    const queue = path.filter((p) => (inDegree.get(p.stepId) || 0) === 0).map((p) => p.stepId);
    const removed = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      removed.add(current);
      const step = path.find((p) => p.stepId === current);
      for (const edge of step.outgoingEdges) {
        if (edge.target !== 'end' && edge.target !== 'start' && pathIds.has(edge.target) && !loopIds.has(edge.target)) {
          const nextDegree = (inDegree.get(edge.target) || 0) - 1;
          inDegree.set(edge.target, nextDegree);
          if (nextDegree === 0 && !removed.has(edge.target)) {
            queue.push(edge.target);
          }
        }
      }
    }

    if (removed.size < path.length) {
      const cyclic = path.find((p) => !removed.has(p.stepId));
      throw new Error(`检测到环：节点 ${cyclic.stepId}`);
    }
  }

  return path;
}

/**
 * 综合校验图，返回所有错误。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Array<{ message: string, nodeId?: string, edgeId?: string }>}
 */
export function validateGraph(nodes, edges) {
  const errors = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 检查 Start 和 End 存在
  if (!nodeMap.has('start')) {
    errors.push({ message: '图缺少 Start 节点', nodeId: 'start' });
  }
  if (!nodeMap.has('end')) {
    errors.push({ message: '图缺少 End 节点', nodeId: 'end' });
  }

  // 检查 Start 和 End 类型正确
  const startNode = nodeMap.get('start');
  if (startNode && startNode.type !== 'start') {
    errors.push({ message: 'Start 节点类型不正确', nodeId: 'start' });
  }
  const endNode = nodeMap.get('end');
  if (endNode && endNode.type !== 'end') {
    errors.push({ message: 'End 节点类型不正确', nodeId: 'end' });
  }

  // 检查所有边引用的节点都存在
  for (const edge of edges) {
    if (!nodeMap.has(edge.source)) {
      errors.push({ message: `边 ${edge.id} 引用不存在的源节点：${edge.source}`, edgeId: edge.id });
    }
    if (!nodeMap.has(edge.target)) {
      errors.push({ message: `边 ${edge.id} 引用不存在的目标节点：${edge.target}`, edgeId: edge.id });
    }
  }

  // 检查自连接
  for (const edge of edges) {
    if (edge.source === edge.target) {
      errors.push({ message: `自连接非法：节点 ${edge.source} 连接到自身`, edgeId: edge.id, nodeId: edge.source });
    }
  }

  // 构建邻接表
  const outgoingEdges = new Map();
  const incomingEdges = new Map();
  for (const edge of edges) {
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, []);
    outgoingEdges.get(edge.source).push(edge);
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    incomingEdges.get(edge.target).push(edge);
  }

  // 检查边类型合法性
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (sourceNode && targetNode) {
      // 合法连线：Start→Request/Loop/Parallel、Request→Request/Loop/Parallel/End、Loop→Request/End、Parallel→Request/End
      const validTargets = {
        start: ['request', 'loop', 'parallel'],
        request: ['request', 'loop', 'parallel', 'end'],
        loop: ['request', 'end'],
        parallel: ['request', 'end']
      };
      const isValid = (validTargets[sourceNode.type] || []).includes(targetNode.type);
      if (!isValid) {
        errors.push({
          message: `非法连线：${sourceNode.type} → ${targetNode.type}`,
          edgeId: edge.id
        });
      }
    }
  }

  // 并行组节点校验
  for (const node of nodes) {
    if (node.type !== NODE_TYPES.PARALLEL) continue;
    const nodeName = node.alias || node.id;
    // 检查是否有 parentId 属性（并行组自身不应有 parentId）
    if (node.parentId) {
      errors.push({ message: `并行组节点「${nodeName}」不应属于其他组`, nodeId: node.id });
    }
  }

  // parentId 校验：如果节点声明了 parentId，验证父节点存在且为 parallel 类型
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (node.type !== 'request') {
      errors.push({ message: `节点「${nodeName(node)}」声明了父容器但类型不是 request`, nodeId: node.id });
    }
    const parent = nodeMap.get(node.parentId);
    if (!parent) {
      errors.push({ message: `节点「${nodeName(node)}」的父容器 ${node.parentId} 不存在`, nodeId: node.id });
    } else if (parent.type !== NODE_TYPES.PARALLEL) {
      errors.push({ message: `节点「${nodeName(node)}」的父容器 ${node.parentId} 不是并行组节点`, nodeId: node.id });
    }
    // 子节点不应有连线到主流程的边
    const childEdges = edges.filter((e) => e.source === node.id || e.target === node.id);
    if (childEdges.length > 0) {
      errors.push({ message: `并行组子节点「${nodeName(node)}」不应有连线（通过父容器连线）`, nodeId: node.id });
    }
  }

  // 辅助：取节点显示名
  function nodeName(node) {
    return node.alias || node.id;
  }

  // 循环节点结构校验（已有任一连线时才检查，避免新建空节点即报错）
  for (const node of nodes) {
    if (node.type !== NODE_TYPES.LOOP) continue;
    const outEdges = edges.filter((e) => e.source === node.id);
    const inEdges = edges.filter((e) => e.target === node.id);
    if (outEdges.length === 0 && inEdges.length === 0) continue;

    const nodeName = node.alias || node.id;
    const bodyCount = outEdges.filter((e) => e.loopKind === LOOP_EDGE_KINDS.BODY).length;
    const doneCount = outEdges.filter((e) => e.loopKind === LOOP_EDGE_KINDS.DONE).length;
    const backCount = inEdges.filter((e) => e.loopKind === LOOP_EDGE_KINDS.BACK).length;
    const entryCount = inEdges.filter((e) => !e.loopKind).length;

    if (bodyCount !== 1) {
      errors.push({ message: `循环节点「${nodeName}」必须有恰好一条「循环体」出边`, nodeId: node.id });
    }
    if (doneCount !== 1) {
      errors.push({ message: `循环节点「${nodeName}」必须有恰好一条「完成后」出边`, nodeId: node.id });
    }
    if (entryCount !== 1) {
      errors.push({ message: `循环节点「${nodeName}」必须有恰好一条入口连线`, nodeId: node.id });
    }
    if (backCount === 0) {
      errors.push({ message: `循环节点「${nodeName}」缺少回边（循环体尾节点需连回循环节点）`, nodeId: node.id });
    }
    if (backCount > 1) {
      errors.push({ message: `循环节点「${nodeName}」只允许一条回边`, nodeId: node.id });
    }

    const configCheck = validateLoopConfig(node.loopConfig);
    if (!configCheck.valid) {
      errors.push({ message: `循环节点「${nodeName}」${configCheck.error}`, nodeId: node.id });
    }
  }

  // 尝试解析执行路径
  try {
    resolveExecutionPath(nodes, edges);
  } catch (e) {
    const alreadyReported = errors.some(
      (err) => err.message === e.message
    );
    if (!alreadyReported) {
      errors.push({ message: e.message });
    }
  }

  return errors;
}

/**
 * 获取指定 stepId 的直接前驱 stepId。
 * 用于 `$flow.last` 表达式求值。
 *
 * @param {string} stepId
 * @param {Array} edges
 * @returns {string|null}
 */
export function getPredecessorStepId(stepId, edges) {
  for (const edge of edges) {
    if (edge.target === stepId) {
      // 如果前驱是 Start，返回 null（Start 没有 body）
      if (edge.source === 'start') {
        return null;
      }
      return edge.source;
    }
  }
  return null;
}

/**
 * 校验循环节点的数据源配置。
 *
 * @param {Object} loopConfig { source: { kind, expression?, value?, variableName? }, collectExpression?, maxIterations? }
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateLoopConfig(loopConfig) {
  const cfg = loopConfig || {};
  const source = cfg.source || {};

  if (source.kind === 'expression') {
    if (!source.expression || !source.expression.trim()) {
      return { valid: false, error: '未配置数据源表达式' };
    }
    const { valid, error } = validateFlowExpression(source.expression.trim());
    if (!valid) {
      return { valid: false, error: `数据源表达式无效：${error}` };
    }
  } else if (source.kind === 'literal') {
    if (source.value === undefined || String(source.value).trim() === '') {
      return { valid: false, error: '未配置字面量数据源' };
    }
    try {
      const parsed = typeof source.value === 'string' ? JSON.parse(source.value) : source.value;
      if (!Array.isArray(parsed)) {
        return { valid: false, error: '字面量数据源必须是 JSON 数组' };
      }
    } catch {
      return { valid: false, error: '字面量数据源 JSON 解析失败' };
    }
  } else if (source.kind === 'variable') {
    if (!source.variableName || !source.variableName.trim()) {
      return { valid: false, error: '未配置数据源变量名' };
    }
  } else {
    return { valid: false, error: '未配置数据源' };
  }

  if (cfg.collectExpression && String(cfg.collectExpression).trim()) {
    const { valid, error } = validateFlowExpression(String(cfg.collectExpression).trim());
    if (!valid) {
      return { valid: false, error: `收集表达式无效：${error}` };
    }
  }

  if (cfg.maxIterations !== undefined && cfg.maxIterations !== null && cfg.maxIterations !== '') {
    const max = Number(cfg.maxIterations);
    if (!Number.isInteger(max) || max < 1) {
      return { valid: false, error: '迭代上限必须是不小于 1 的整数' };
    }
  }

  return { valid: true };
}

/**
 * 生成循环节点数据源的摘要文案（画布卡片与配置面板使用）。
 */
export function summarizeLoopSource(loopConfig) {
  const source = loopConfig?.source || {};
  if (source.kind === 'literal') {
    const raw = typeof source.value === 'string' ? source.value : JSON.stringify(source.value);
    return `字面量 ${(raw || '').slice(0, 24)}`;
  }
  if (source.kind === 'variable') {
    return `变量 ${source.variableName || '?'}`;
  }
  if (source.kind === 'expression') {
    return source.expression || '未配置数据源';
  }
  return '未配置数据源';
}

export { NODE_TYPES, EDGE_TYPES, LOOP_EDGE_KINDS };
