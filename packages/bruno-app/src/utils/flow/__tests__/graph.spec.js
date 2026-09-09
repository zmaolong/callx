/**
 * Flow 图辅助函数测试
 */
import {
  createFlowGraph,
  resolveMainChain,
  validateGraph,
  getDisconnectedNodes,
  getPredecessorStepId,
  generateNodeStepId,
  generateEdgeId
} from '../graph';

describe('createFlowGraph', () => {
  it('应创建包含 Start 和 End 节点的初始图', () => {
    const graph = createFlowGraph();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);

    const startNode = graph.nodes.find((n) => n.id === 'start');
    const endNode = graph.nodes.find((n) => n.id === 'end');
    expect(startNode).toBeDefined();
    expect(startNode.type).toBe('start');
    expect(endNode).toBeDefined();
    expect(endNode.type).toBe('end');
  });
});

describe('generateNodeStepId', () => {
  it('应生成以 step_ 开头的 ID', () => {
    const id = generateNodeStepId();
    expect(id.startsWith('step_')).toBe(true);
  });
});

describe('generateEdgeId', () => {
  it('应生成正确的边 ID', () => {
    expect(generateEdgeId('a', 'b')).toBe('edge_a_b');
    expect(generateEdgeId('start', 'step_abc')).toBe('edge_start_step_abc');
  });
});

describe('resolveMainChain', () => {
  const makeNodes = (extraNodes = []) => [
    { id: 'start', type: 'start' },
    { id: 'end', type: 'end' },
    ...extraNodes
  ];

  const makeEdges = (pairs) =>
    pairs.map(([source, target]) => ({
      id: `edge_${source}_${target}`,
      source,
      target
    }));

  it('应解析合法 Start → A → B → End 的正确顺序', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_b'],
      ['step_b', 'end']
    ]);
    const chain = resolveMainChain(nodes, edges);
    expect(chain).toEqual(['step_a', 'step_b']);
  });

  it('Start → A → End 单步链', () => {
    const nodes = makeNodes([{ id: 'step_a', type: 'request' }]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'end']
    ]);
    expect(resolveMainChain(nodes, edges)).toEqual(['step_a']);
  });

  it('无连线时返回空数组', () => {
    const nodes = makeNodes([{ id: 'step_a', type: 'request' }]);
    expect(resolveMainChain(nodes, [])).toEqual([]);
  });

  it('未连接节点不参与主链', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request', requestUid: 'orphan' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'end']
    ]);
    expect(resolveMainChain(nodes, edges)).toEqual(['step_a']);
  });

  it('Start 多出边分叉应抛出错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['start', 'step_b']
    ]);
    expect(() => resolveMainChain(nodes, edges)).toThrow('Start 节点有多条出边');
  });

  it('End 多入边合流应抛出错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' }
    ]);
    // 两条独立链都指向 End：Start→A→End, B→End（B 未连接 Start）
    // 这样 Start 只有 1 条出边，但 End 有 2 条入边
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'end'],
      ['step_b', 'end']
    ]);
    expect(() => resolveMainChain(nodes, edges)).toThrow('End 节点有多条入边');
  });

  it('Request 节点分叉应抛出错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' },
      { id: 'step_c', type: 'request' }
    ]);
    // A→B, A→C：A 分叉，但 End 只有 1 条入边（B→End）
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_b'],
      ['step_a', 'step_c'],
      ['step_b', 'end']
    ]);
    expect(() => resolveMainChain(nodes, edges)).toThrow('不允许分叉');
  });

  it('环应抛出错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' }
    ]);
    // 长链中的环：Start→A→B→C→B，C→B 形成环，但 B 只有 2 条入边
    // 实际上环在链式结构中必然导致某节点入度 > 1
    // 这里用三节点环：Start→A→B→C→A，A 有 2 条入边
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_b'],
      ['step_b', 'step_a']
    ]);
    // 环在被检测到之前，会先被入度检查捕获
    expect(() => resolveMainChain(nodes, edges)).toThrow();
  });

  it('自连接应抛出错误', () => {
    const nodes = makeNodes([{ id: 'step_a', type: 'request' }]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_a']
    ]);
    expect(() => resolveMainChain(nodes, edges)).toThrow('自连接');
  });

  it('缺少 Start 应抛出错误', () => {
    const nodes = [{ id: 'end', type: 'end' }];
    expect(() => resolveMainChain(nodes, [])).toThrow('缺少 Start 节点');
  });

  it('缺少 End 应抛出错误', () => {
    const nodes = [{ id: 'start', type: 'start' }];
    expect(() => resolveMainChain(nodes, [])).toThrow('缺少 End 节点');
  });
});

describe('validateGraph', () => {
  it('合法图应返回空错误数组', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'end' }
    ];
    expect(validateGraph(nodes, edges)).toEqual([]);
  });

  it('非法连线应被检测到', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'end' }
    ];
    const errors = validateGraph(nodes, edges);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('非法连线'))).toBe(true);
  });

  it('边引用不存在的节点应报错', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'ghost' }
    ];
    const errors = validateGraph(nodes, edges);
    expect(errors.some((e) => e.message.includes('不存在的目标节点'))).toBe(true);
  });
});

describe('getDisconnectedNodes', () => {
  it('应返回未接入主链的 Request 节点', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request', requestUid: 'orphan' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'end' }
    ];
    const disconnected = getDisconnectedNodes(nodes, edges);
    expect(disconnected).toEqual(['step_b']);
  });

  it('所有节点都连接时应返回空数组', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'end' }
    ];
    expect(getDisconnectedNodes(nodes, edges)).toEqual([]);
  });
});

describe('getPredecessorStepId', () => {
  it('应返回直接前驱', () => {
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'step_b' }
    ];
    expect(getPredecessorStepId('step_b', edges)).toBe('step_a');
  });

  it('前驱为 Start 时返回 null', () => {
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' }
    ];
    expect(getPredecessorStepId('step_a', edges)).toBeNull();
  });

  it('无入边时返回 null', () => {
    expect(getPredecessorStepId('step_a', [])).toBeNull();
  });
});
