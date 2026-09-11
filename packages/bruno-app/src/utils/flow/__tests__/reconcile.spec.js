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

  it('requestPath 应回退到 pathname', () => {
    const request = { uid: 'req_002', name: '查询', pathname: '/coll/flow_a/query.bru' };
    const node = createNodeForRequest(request);
    expect(node.requestPath).toBe('/coll/flow_a/query.bru');
  });

  it('无 filename 和 pathname 时应返回空字符串', () => {
    const request = { uid: 'req_003', name: '测试' };
    const node = createNodeForRequest(request);
    expect(node.requestPath).toBe('');
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

  it('重启场景：requestUid 变化但 requestPath 匹配——不应重复创建', () => {
    // 模拟重启后：已有节点的 requestUid 是旧 uid，新加载的请求文件有新 uid
    // 但 requestPath（文件名）是一样的
    const flowNodes = [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      { id: 'step_a', type: 'request', requestUid: 'old_uid_001', requestPath: 'login.bru' }
    ];
    const requestItems = [
      { uid: 'new_uid_001', name: '登录', filename: 'login.bru' }
    ];
    // 按 requestPath 匹配到了已有节点，不应重复创建
    const newNodes = reconcileFlowNodes(flowNodes, requestItems);
    expect(newNodes).toEqual([]);
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
    expect(result.nodesToUpdateUid).toEqual([]);
  });

  describe('path-based fallback（重启后 uid 变化场景）', () => {
    it('通过 requestPath 匹配到请求且 requestUid 不同时应保留节点并更新 uid', () => {
      const nodes = [
        { id: 'start', type: 'start' },
        { id: 'end', type: 'end' },
        { id: 'step_a', type: 'request', requestUid: 'old_uid', requestPath: 'login.bru' }
      ];
      const edges = [
        { id: 'e1', source: 'start', target: 'step_a' },
        { id: 'e2', source: 'step_a', target: 'end' }
      ];
      const requestItems = [{ uid: 'new_uid', name: '登录', filename: 'login.bru' }];
      const result = removeOrphanedNodes(nodes, edges, requestItems);

      // 节点应保留
      expect(result.nodes).toHaveLength(3);
      const keptStepA = result.nodes.find((n) => n.id === 'step_a');
      expect(keptStepA).toBeDefined();
      // requestUid 应更新为新 uid
      expect(keptStepA.requestUid).toBe('new_uid');
      // 边应完整保留
      expect(result.edges).toHaveLength(2);

      // 返回更新指令
      expect(result.nodesToUpdateUid).toHaveLength(1);
      expect(result.nodesToUpdateUid[0]).toEqual({ nodeId: 'step_a', newUid: 'new_uid' });
    });

    it('通过 pathname（无 filename）也应能匹配', () => {
      const nodes = [
        { id: 'step_a', type: 'request', requestUid: 'old_uid', requestPath: '/coll/flow_a/login.bru' }
      ];
      const requestItems = [{ uid: 'new_uid', name: '登录', pathname: '/coll/flow_a/login.bru' }];
      const result = removeOrphanedNodes(nodes, [], requestItems);

      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].requestUid).toBe('new_uid');
      expect(result.nodesToUpdateUid).toHaveLength(1);
    });

    it('节点无 requestPath 时应回退到纯 uid 比较（正常 orphans 逻辑）', () => {
      const nodes = [
        { id: 'step_a', type: 'request', requestUid: 'old_uid' }
        // 没有 requestPath
      ];
      const requestItems = [{ uid: 'new_uid', name: '登录', filename: 'login.bru' }];
      const result = removeOrphanedNodes(nodes, [], requestItems);

      // uid 不匹配，path 也无法回退——标记为 orphan
      expect(result.nodes).toHaveLength(0);
      expect(result.nodesToUpdateUid).toHaveLength(0);
    });

    it('请求无 filename/pathname 时应回退到纯 uid 比较', () => {
      const nodes = [
        { id: 'step_a', type: 'request', requestUid: 'old_uid', requestPath: 'login.bru' }
      ];
      const requestItems = [{ uid: 'new_uid', name: '登录' }]; // 无 filename 和 pathname
      const result = removeOrphanedNodes(nodes, [], requestItems);

      // uid 不匹配，请求方无 path 信息——标记为 orphan
      expect(result.nodes).toHaveLength(0);
      expect(result.nodesToUpdateUid).toHaveLength(0);
    });

    it('多个节点中部分匹配部分孤儿', () => {
      const nodes = [
        { id: 'step_a', type: 'request', requestUid: 'old_a', requestPath: 'login.bru' },
        { id: 'step_b', type: 'request', requestUid: 'old_b', requestPath: 'query.bru' },
        { id: 'step_c', type: 'request', requestUid: 'old_c', requestPath: 'deleted.bru' }
      ];
      const edges = [
        { id: 'e1', source: 'start', target: 'step_a' },
        { id: 'e2', source: 'step_a', target: 'step_b' },
        { id: 'e3', source: 'step_b', target: 'step_c' }
      ];
      const requestItems = [
        { uid: 'new_a', name: '登录', filename: 'login.bru' },
        { uid: 'new_b', name: '查询', filename: 'query.bru' }
        // step_c (deleted.bru) 已被物理删除 — 不应出现在这里
      ];
      const result = removeOrphanedNodes(nodes, edges, requestItems);

      // step_a 和 step_b 应通过 requestPath 匹配保留，step_c 应移除
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes.find((n) => n.id === 'step_c')).toBeUndefined();

      // 只有 step_a 和 step_b 之间的边应保留
      expect(result.edges).toHaveLength(2);
      expect(result.edges.find((e) => e.id === 'e3')).toBeUndefined();

      // step_a 和 step_b 的 uid 应更新
      expect(result.nodesToUpdateUid).toHaveLength(2);
    });
  });
});