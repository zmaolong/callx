/**
 * Flow 图辅助函数测试
 */
import {
  createFlowGraph,
  resolveExecutionPath,
  validateGraph,
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

describe('resolveExecutionPath — 合流与环检测', () => {
  const makeNodes = (extra = []) => [
    { id: 'start', type: 'start' },
    { id: 'end', type: 'end' },
    ...extra
  ];

  const makeEdges = (pairs) =>
    pairs.map(([source, target]) => ({
      id: `edge_${source}_${target}`,
      source,
      target
    }));

  it('不等长分支合流（BFS 序与拓扑序不一致）不应误判为环', () => {
    // start→A→X→B 与 start→B 直连：B 在 BFS 序中先于 X 出现，
    // 旧实现按 BFS 下标比较会把 X→B 误判为环
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' },
      { id: 'step_x', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['start', 'step_b'],
      ['step_a', 'step_x'],
      ['step_x', 'step_b'],
      ['step_b', 'end']
    ]);

    const path = resolveExecutionPath(nodes, edges);
    expect(path.map((p) => p.stepId)).toEqual(['step_a', 'step_b', 'step_x']);
  });

  it('validateGraph 对不等长合流图应返回空错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' },
      { id: 'step_x', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['start', 'step_b'],
      ['step_a', 'step_x'],
      ['step_x', 'step_b'],
      ['step_b', 'end']
    ]);

    expect(validateGraph(nodes, edges)).toEqual([]);
  });

  it('真环仍应抛出错误', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_b'],
      ['step_b', 'step_a']
    ]);

    expect(() => resolveExecutionPath(nodes, edges)).toThrow(/检测到环/);
  });

  it('等长菱形合流（两分支等长）应正常解析', () => {
    const nodes = makeNodes([
      { id: 'step_a', type: 'request' },
      { id: 'step_b', type: 'request' },
      { id: 'step_c', type: 'request' },
      { id: 'step_d', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'step_a'],
      ['step_a', 'step_b'],
      ['step_a', 'step_c'],
      ['step_b', 'step_d'],
      ['step_c', 'step_d'],
      ['step_d', 'end']
    ]);

    const path = resolveExecutionPath(nodes, edges);
    expect(path).toHaveLength(4);
  });
});

describe('validateGraph — 循环节点', () => {
  const makeNodes = (extra = []) => [
    { id: 'start', type: 'start' },
    { id: 'end', type: 'end' },
    ...extra
  ];

  const makeEdges = (pairs, extraProps = {}) =>
    pairs.map(([source, target], i) => ({
      id: `edge_${source}_${target}_${i}`,
      source,
      target,
      ...(extraProps[`${source}->${target}`] || {})
    }));

  const validLoopConfig = {
    source: { kind: 'literal', value: '[1, 2]' },
    collectExpression: '',
    maxIterations: 100
  };

  const loopGraph = (overrides = {}) => {
    const nodes = makeNodes([
      { id: 'loop1', type: 'loop', loopConfig: overrides.loopConfig || validLoopConfig },
      { id: 'step_b1', type: 'request' },
      { id: 'step_d', type: 'request' }
    ]);
    const edges = makeEdges([
      ['start', 'loop1'],
      ['loop1', 'step_b1'],
      ['loop1', 'step_d'],
      ['step_b1', 'loop1'],
      ['step_d', 'end']
    ], {
      'loop1->step_b1': { loopKind: 'body' },
      'loop1->step_d': { loopKind: 'done' },
      'step_b1->loop1': { loopKind: 'back' }
    });
    return { nodes, edges: overrides.edges || edges };
  };

  it('完整合法的循环节点图应返回空错误', () => {
    expect(validateGraph(loopGraph().nodes, loopGraph().edges)).toEqual([]);
  });

  it('缺回边应报错', () => {
    const { nodes, edges } = loopGraph({
      edges: makeEdges([
        ['start', 'loop1'],
        ['loop1', 'step_b1'],
        ['loop1', 'step_d'],
        ['step_d', 'end']
      ], {
        'loop1->step_b1': { loopKind: 'body' },
        'loop1->step_d': { loopKind: 'done' }
      })
    });
    const errors = validateGraph(nodes, edges);
    expect(errors.some((e) => e.message.includes('缺少回边'))).toBe(true);
  });

  it('出边未标记 body/done 语义应报错', () => {
    const { nodes, edges } = loopGraph({
      edges: makeEdges([
        ['start', 'loop1'],
        ['loop1', 'step_b1'],
        ['loop1', 'step_d'],
        ['step_b1', 'loop1'],
        ['step_d', 'end']
      ], {
        'step_b1->loop1': { loopKind: 'back' }
      })
    });
    const errors = validateGraph(nodes, edges);
    expect(errors.some((e) => e.message.includes('循环体'))).toBe(true);
    expect(errors.some((e) => e.message.includes('完成后'))).toBe(true);
  });

  it('字面量数据源不是数组应报错', () => {
    const { nodes, edges } = loopGraph({
      loopConfig: { ...validLoopConfig, source: { kind: 'literal', value: '{"a":1}' } }
    });
    const errors = validateGraph(nodes, edges);
    expect(errors.some((e) => e.message.includes('JSON 数组'))).toBe(true);
  });

  it('迭代上限非正整数应报错', () => {
    const { nodes, edges } = loopGraph({
      loopConfig: { ...validLoopConfig, maxIterations: 0 }
    });
    const errors = validateGraph(nodes, edges);
    expect(errors.some((e) => e.message.includes('迭代上限'))).toBe(true);
  });

  it('无任何连线的循环节点不报结构错误', () => {
    const nodes = makeNodes([{ id: 'loop1', type: 'loop', loopConfig: validLoopConfig }]);
    expect(validateGraph(nodes, [])).toEqual([]);
  });

  it('loop+back-edge 结构不应被拓扑环检测误判', () => {
    const { nodes, edges } = loopGraph();
    const path = resolveExecutionPath(nodes, edges);
    expect(path.map((p) => p.stepId)).toEqual(['loop1', 'step_b1', 'step_d']);
  });
});
