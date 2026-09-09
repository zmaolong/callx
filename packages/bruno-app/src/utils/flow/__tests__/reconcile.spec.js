/**
 * reconcile 函数测试
 */
import {
  reconcileFlowNodes,
  removeOrphanedNodes,
  createNodeForRequest
} from '../reconcile';

describe('createNodeForRequest', () => {
  it('应为请求创建未连接节点', () => {
    const request = { uid: 'req_001', name: '登录', filename: 'login.bru' };
    const node = createNodeForRequest(request);
    expect(node.type).toBe('request');
    expect(node.requestUid).toBe('req_001');
    expect(node.requestPath).toBe('login.bru');
    expect(node.alias).toBe('登录');
    expect(node.inputs).toEqual([]);
    expect(node.id.startsWith('step_')).toBe(true);
  });
});

describe('reconcileFlowNodes', () => {
  it('不存在于图中的请求应生成新节点', () => {
    const flowNodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request', requestUid: 'req_001' }
    ];
    const requestItems = [
      { uid: 'req_001', name: '登录', filename: 'login.bru' },
      { uid: 'req_002', name: '查询', filename: 'query.bru' }
    ];
    const newNodes = reconcileFlowNodes(flowNodes, requestItems);
    expect(newNodes).toHaveLength(1);
    expect(newNodes[0].requestUid).toBe('req_002');
    expect(newNodes[0].type).toBe('request');
  });

  it('所有请求已在图中时应返回空数组', () => {
    const flowNodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request', requestUid: 'req_001' }
    ];
    const requestItems = [
      { uid: 'req_001', name: '登录', filename: 'login.bru' }
    ];
    expect(reconcileFlowNodes(flowNodes, requestItems)).toEqual([]);
  });

  it('非数组参数应返回空数组', () => {
    expect(reconcileFlowNodes(null, [])).toEqual([]);
    expect(reconcileFlowNodes([], null)).toEqual([]);
  });
});

describe('removeOrphanedNodes', () => {
  it('应移除图中引用不存在的请求节点', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request', requestUid: 'req_001' },
      { id: 'step_b', type: 'request', requestUid: 'req_002' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'step_b' },
      { id: 'e3', source: 'step_b', target: 'end' }
    ];
    const requestItems = [{ uid: 'req_001', name: '登录' }];
    const result = removeOrphanedNodes(nodes, edges, requestItems);
    expect(result.nodes).toHaveLength(3); // start, end, step_a
    expect(result.nodes.find((n) => n.id === 'step_b')).toBeUndefined();
    expect(result.edges).toHaveLength(1); // 只有 e1 (start→step_a) 保留
    expect(result.edges.find((e) => e.source === 'step_a' && e.target === 'step_b')).toBeUndefined();
  });

  it('Start/End 节点始终保留', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' }
    ];
    const result = removeOrphanedNodes(nodes, [], []);
    expect(result.nodes).toHaveLength(2);
  });

  it('没有孤儿节点时应保持原样', () => {
    const nodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request', requestUid: 'req_001' }
    ];
    const edges = [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'end' }
    ];
    const requestItems = [{ uid: 'req_001' }];
    const result = removeOrphanedNodes(nodes, edges, requestItems);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
  });
});
