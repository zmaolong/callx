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
 * 解析唯一主链——从 Start 出发，沿唯一出边遍历到 End。
 *
 * 向后兼容：在无分支图中等同于旧版 resolveMainChain。
 * 新版按条件分支优先级遍历：优先选带条件的边（先匹配先走），最后走无条件边。
 *
 * @param {Array} nodes 图中所有节点
 * @param {Array} edges 图中所有边
 * @returns {string[]} 有序 stepId 数组（不含 Start/End）
 * @throws {Error} 当图不合法时抛出可定位错误
 */
export function resolveMainChain(nodes, edges) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // 验证 Start 和 End 存在
  const startNode = nodeMap.get('start');
  const endNode = nodeMap.get('end');
  if (!startNode) {
    throw new Error('图缺少 Start 节点');
  }
  if (!endNode) {
    throw new Error('图缺少 End 节点');
  }

  // 构建邻接表
  const outgoingEdges = new Map(); // source -> [edge]
  const incomingEdges = new Map(); // target -> [edge]

  for (const edge of edges) {
    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source).push(edge);

    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target).push(edge);
  }

  // 校验自连接
  for (const edge of edges) {
    if (edge.source === edge.target) {
      throw new Error(`自连接非法：节点 ${edge.source} 连接到自身`);
    }
  }

  // 没有连接到 Start 的边，返回空主链
  const startOut = outgoingEdges.get('start') || [];
  if (startOut.length === 0) {
    return [];
  }

  // BFS 遍历：从 Start 到 End 的路径（仅用于校验和预览）
  const chain = [];
  const visited = new Set();
  let current = startOut[0].target;

  while (current !== 'end') {
    // 检查环
    if (visited.has(current)) {
      throw new Error(`检测到环：节点 ${current} 被重复访问`);
    }
    visited.add(current);

    // 检查节点存在
    if (!nodeMap.has(current)) {
      throw new Error(`边引用不存在的节点：${current}`);
    }

    const out = outgoingEdges.get(current) || [];

    // 无出边 —— 链尾
    if (out.length === 0) {
      break;
    }

    chain.push(current);
    // 优先走无条件边；多条无条件边时走第一条
    const defaultEdge = out.find((e) => !e.condition) || out[0];
    current = defaultEdge.target;
  }

  return chain;
}

/**
 * 构建有序执行路径——运行时使用。
 *
 * 与 resolveMainChain 不同，该函数在分支点收集所有分支信息，
 * 返回的 path 包含每个节点的出边列表，供运行时动态评估条件选择分支。
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

  // 环检测
  if (path.length > 0) {
    // 再次遍历检测环——出边指向已访问但尚未处理完的节点
    const pathIds = new Set(path.map((p) => p.stepId));
    for (const step of path) {
      for (const edge of step.outgoingEdges) {
        if (edge.target !== 'end' && edge.target !== 'start' && pathIds.has(edge.target)) {
          // 安全：允许合流（多条入边指向同一节点）
          // 只有形成循环引用才报错
          const targetStep = path.find((p) => p.stepId === edge.target);
          if (targetStep && path.indexOf(targetStep) < path.indexOf(step)) {
            throw new Error(`检测到环：节点 ${edge.target}`);
          }
        }
      }
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
 * 返回未接入主链的节点（不包括 Start 和 End）。
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Array} 未连接节点的 ID 数组
 */
export function getDisconnectedNodes(nodes, edges) {
  // 构建邻接表
  const outgoingEdges = new Map();
  const incomingEdges = new Map();
  for (const edge of edges) {
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, []);
    outgoingEdges.get(edge.source).push(edge);
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    incomingEdges.get(edge.target).push(edge);
  }

  // 从 Start 开始 BFS
  const connected = new Set();
  const queue = ['start'];
  while (queue.length > 0) {
    const current = queue.shift();
    if (connected.has(current)) continue;
    connected.add(current);
    const out = outgoingEdges.get(current) || [];
    for (const edge of out) {
      if (!connected.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // 从 End 反向 BFS
  const reverseQueue = ['end'];
  while (reverseQueue.length > 0) {
    const current = reverseQueue.shift();
    if (connected.has(current)) continue;
    connected.add(current);
    const inEdges = incomingEdges.get(current) || [];
    for (const edge of inEdges) {
      if (!connected.has(edge.source)) {
        reverseQueue.push(edge.source);
      }
    }
  }

  // 收集不在主链中的 Request 节点
  const disconnected = [];
  for (const node of nodes) {
    if (node.type === 'request' && !connected.has(node.id)) {
      disconnected.push(node.id);
    }
  }

  return disconnected;
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
