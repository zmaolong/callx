/**
 * Flow 图辅助函数
 *
 * 负责 Flow 图的创建、校验、主链解析和未连接节点识别。
 * 所有函数都是纯函数，不依赖 Redux 或外部状态。
 */
import { customAlphabet } from 'nanoid';

const STEP_ID_ALPHABET = 'useandom26T198340PX75pxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict';
const generateStepId = customAlphabet(STEP_ID_ALPHABET, 16);

const NODE_TYPES = {
  START: 'start',
  END: 'end',
  REQUEST: 'request'
};

const EDGE_TYPES = {
  DEFAULT: 'default'
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

  // 从 Start 出发，收集所有可达节点（不含 Start/End）
  const path = [];
  const visited = new Set();
  const queue = ['start'];

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

    const out = outgoingEdges.get(current) || [];
    for (const edge of out) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // 环检测：对可达子图做 Kahn 拓扑排序。
  // 不能用 BFS 序下标判断——合流分支长度不等时，汇合点在 BFS 序中
  // 可能先于长分支尾节点出现，会被误判为环。
  if (path.length > 0) {
    // 统计可达子图内各节点的入度（只统计来自可达节点的边，忽略指向 start 的边）
    const pathIds = new Set(path.map((p) => p.stepId));
    const inDegree = new Map();
    for (const step of path) {
      if (!inDegree.has(step.stepId)) inDegree.set(step.stepId, 0);
      for (const edge of step.outgoingEdges) {
        if (edge.target !== 'end' && edge.target !== 'start' && pathIds.has(edge.target)) {
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
        if (edge.target !== 'end' && edge.target !== 'start' && pathIds.has(edge.target)) {
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
      // 仅允许 Start→Request、Request→Request、Request→End
      const validPairs = [
        ['start', 'request'],
        ['request', 'request'],
        ['request', 'end']
      ];
      const isValid = validPairs.some(([s, t]) => {
        const srcType = s === 'start' ? 'start' : 'request';
        const tgtType = t === 'end' ? 'end' : 'request';
        return sourceNode.type === srcType && targetNode.type === tgtType;
      });
      if (!isValid) {
        errors.push({
          message: `非法连线：${sourceNode.type} → ${targetNode.type}`,
          edgeId: edge.id
        });
      }
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

export { NODE_TYPES, EDGE_TYPES };
