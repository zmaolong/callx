/**
 * Flow 执行器测试
 *
 * 覆盖：取消贯通（token 传递 + isCancel 识别）、jump 真跳转、
 * 分支终止语义、continue 后出边条件求值、runtimeVariables 隔离、并发拒绝。
 */
import flowRunReducer, { NODE_STATUS, FLOW_STATUS } from 'providers/ReduxStore/slices/flowRun';
import { executeFlow, executeSingleNode, cancelFlow } from 'utils/flow/executor';

// 模拟网络层
jest.mock('utils/network/index', () => ({
  sendNetworkRequest: jest.fn(),
  cancelNetworkRequest: jest.fn()
}));

const { sendNetworkRequest, cancelNetworkRequest } = require('utils/network/index');

const okResponse = (body = { ok: true }, status = 200) => ({
  state: 'success',
  data: body,
  dataBuffer: null,
  headers: { 'content-type': 'application/json' },
  size: 10,
  status,
  statusText: 'OK',
  duration: 5,
  timeline: [],
  stream: null,
  requestSent: { url: 'http://test', method: 'GET' }
});

// —— 测试脚手架：用真实 flowRun reducer 驱动状态 ——
const FLOW_UID = 'flow1';

const makeNode = (id, extra = {}) => ({
  id,
  type: 'request',
  requestUid: `req_${id}`,
  inputs: [],
  ...extra
});

const makeEdge = (source, target, extra = {}) => ({
  id: `edge_${source}_${target}`,
  source,
  target,
  ...extra
});

const makeGraph = (requestNodes, edges) => ({
  nodes: [{ id: 'start', type: 'start' }, { id: 'end', type: 'end' }, ...requestNodes],
  edges
});

const makeHarness = ({ runtimeVariables = {} } = {}) => {
  let state = { runs: {} };
  const dispatch = (action) => {
    state = flowRunReducer(state, action);
  };
  const getState = () => ({ flowRun: state });
  const collection = {
    uid: 'col1',
    runtimeVariables: { ...runtimeVariables },
    items: []
  };
  const getRun = () => state.runs[FLOW_UID];
  return { dispatch, getState, collection, getRun };
};

const makeCollectionItems = (...nodeIds) => {
  const map = {};
  for (const id of nodeIds) {
    map[`req_${id}`] = {
      uid: `req_${id}`,
      type: 'http-request',
      request: { url: 'http://test/api', method: 'GET' }
    };
  }
  return map;
};

const runExecuteFlow = async (harness, nodes, edges, options = {}) => {
  return executeFlow({
    flowUid: FLOW_UID,
    collectionUid: 'col1',
    flow: makeGraph(nodes, edges),
    collection: harness.collection,
    collectionItems: makeCollectionItems(...nodes.map((n) => n.id)),
    dispatch: harness.dispatch,
    getState: harness.getState,
    ...options
  });
};

const statusOf = (harness, stepId) => harness.getRun()?.nodes?.[stepId]?.status;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Flow 执行器核心逻辑', () => {
  describe('状态常量', () => {
    it('NODE_STATUS 应包含所有状态值', () => {
      expect(NODE_STATUS.IDLE).toBe('idle');
      expect(NODE_STATUS.QUEUED).toBe('queued');
      expect(NODE_STATUS.RUNNING).toBe('running');
      expect(NODE_STATUS.SUCCESS).toBe('success');
      expect(NODE_STATUS.FAILED).toBe('failed');
      expect(NODE_STATUS.CANCELLED).toBe('cancelled');
      expect(NODE_STATUS.SKIPPED).toBe('skipped');
    });

    it('FLOW_STATUS 应包含所有状态值', () => {
      expect(FLOW_STATUS.IDLE).toBe('idle');
      expect(FLOW_STATUS.RUNNING).toBe('running');
      expect(FLOW_STATUS.SUCCESS).toBe('success');
      expect(FLOW_STATUS.FAILED).toBe('failed');
      expect(FLOW_STATUS.CANCELLED).toBe('cancelled');
    });
  });

  describe('取消贯通（真取消）', () => {
    it('sendNetworkRequest 应收到执行器的 cancelTokenUid（第 5 个参数）', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse());

      await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      const token = harness.getRun()?.cancelTokenUid;
      expect(token).toBeTruthy();
      expect(sendNetworkRequest).toHaveBeenCalledTimes(2);
      for (const call of sendNetworkRequest.mock.calls) {
        expect(call[4]).toBe(token);
      }
    });

    it('isCancel 响应应把当前节点标 cancelled、下游 skipped、流程标 cancelled', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue({
        statusText: 'REQUEST_CANCELLED',
        isCancel: true,
        error: 'REQUEST_CANCELLED'
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.cancelled).toBe(true);
      expect(result.success).toBe(false);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.CANCELLED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.CANCELLED);
    });

    it('reject 携带取消信息时同样走取消路径', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockRejectedValue(new Error('Error invoking remote method: Error: Request cancelled'));

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'end')]
      );

      expect(result.cancelled).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.CANCELLED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.CANCELLED);
    });

    it('cancelFlow 应把 flowRun 中的真实 token 传给网络层', async () => {
      const harness = makeHarness();
      cancelNetworkRequest.mockResolvedValue();

      await cancelFlow(FLOW_UID, null, harness.dispatch, harness.getState);

      // 未初始化运行态时无 token，不应崩溃
      expect(cancelNetworkRequest).toHaveBeenCalledWith(null);

      // 带 token 的场景
      cancelNetworkRequest.mockClear();
      let state = { runs: { [FLOW_UID]: { cancelTokenUid: 'tok-123', cancelled: false } } };
      const dispatch2 = (action) => {
        state = flowRunReducer(state, action);
      };
      const getState2 = () => ({ flowRun: state });
      await cancelFlow(FLOW_UID, null, dispatch2, getState2);
      expect(cancelNetworkRequest).toHaveBeenCalledWith('tok-123');
    });
  });

  describe('jump 错误策略（真跳转）', () => {
    it('A 失败 jump 到 C 时，B 应被跳过且不发起请求，C 正常执行', async () => {
      const harness = makeHarness();
      let callCount = 0;
      sendNetworkRequest.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ error: 'ECONNREFUSED' });
        }
        return Promise.resolve(okResponse());
      });

      const result = await runExecuteFlow(
        harness,
        [
          makeNode('step_a', { errorHandler: { strategy: 'jump', jumpToNodeId: 'step_c' } }),
          makeNode('step_b'),
          makeNode('step_c')
        ],
        [
          makeEdge('start', 'step_a'),
          makeEdge('step_a', 'step_b'),
          makeEdge('step_b', 'step_c'),
          makeEdge('step_c', 'end')
        ]
      );

      expect(result.success).toBe(true);
      // 只有 A 和 C 发起过请求，B 不应发起
      expect(sendNetworkRequest).toHaveBeenCalledTimes(2);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(statusOf(harness, 'step_c')).toBe(NODE_STATUS.SUCCESS);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.SUCCESS);
    });

    it('jump 目标不存在时应终止并报错', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue({ error: 'ECONNREFUSED' });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a', { errorHandler: { strategy: 'jump', jumpToNodeId: 'step_missing' } })],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'end')]
      );

      expect(result.success).toBe(false);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.FAILED);
    });
  });

  describe('分支与终止语义', () => {
    it('所有出边条件不满足且无默认边时，流程应标 failed 而非 success', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse({ code: 0 }, 200));

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b'), makeNode('step_c')],
        [
          makeEdge('start', 'step_a'),
          makeEdge('step_a', 'step_b', { condition: { field: 'step_a.status', operator: 'eq', value: 999 } }),
          makeEdge('step_a', 'step_c', { condition: { field: 'step_a.status', operator: 'eq', value: 888 } })
        ]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('出边');
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(statusOf(harness, 'step_c')).toBe(NODE_STATUS.SKIPPED);
    });

    it('条件命中时应跳到目标节点，中间节点标 skipped', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse());

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b'), makeNode('step_c')],
        [
          makeEdge('start', 'step_a'),
          makeEdge('step_a', 'step_b'),
          makeEdge('step_a', 'step_c', { condition: { field: 'step_a.status', operator: 'eq', value: 200 } }),
          makeEdge('step_c', 'end')
        ]
      );

      expect(result.success).toBe(true);
      expect(sendNetworkRequest).toHaveBeenCalledTimes(2); // a 与 c
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(statusOf(harness, 'step_c')).toBe(NODE_STATUS.SUCCESS);
    });

    it('条件不满足但存在默认（无条件）边时应走默认边', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse({ code: 1 }, 200));

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b'), makeNode('step_c')],
        [
          makeEdge('start', 'step_a'),
          makeEdge('step_a', 'step_b', { condition: { field: 'step_a.status', operator: 'eq', value: 999 } }),
          makeEdge('step_a', 'step_c'),
          makeEdge('step_c', 'end')
        ]
      );

      expect(result.success).toBe(true);
      expect(sendNetworkRequest).toHaveBeenCalledTimes(2); // a 与 c
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(statusOf(harness, 'step_c')).toBe(NODE_STATUS.SUCCESS);
    });

    it('continue 策略失败后应按出边条件选择分支而非线性走下一个', async () => {
      const harness = makeHarness();
      let callCount = 0;
      sendNetworkRequest.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ error: 'ECONNREFUSED' });
        }
        return Promise.resolve(okResponse());
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a', { errorHandler: { strategy: 'continue' } }), makeNode('step_b'), makeNode('step_c')],
        [
          makeEdge('start', 'step_a'),
          makeEdge('step_a', 'step_b', { condition: { field: 'step_a.status', operator: 'eq', value: 200 } }),
          makeEdge('step_a', 'step_c', { condition: { field: 'step_a.status', operator: 'eq', value: 0 } }),
          makeEdge('step_c', 'end')
        ]
      );

      expect(result.success).toBe(true);
      // A 失败（status 记为 0）→ 条件应命中 C 而不是线性走 B
      expect(sendNetworkRequest).toHaveBeenCalledTimes(2);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(statusOf(harness, 'step_c')).toBe(NODE_STATUS.SUCCESS);
    });

    it('continue 策略 + 默认边时应线性走默认分支', async () => {
      const harness = makeHarness();
      let callCount = 0;
      sendNetworkRequest.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ error: 'ECONNREFUSED' });
        }
        return Promise.resolve(okResponse());
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a', { errorHandler: { strategy: 'continue' } }), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.success).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SUCCESS);
    });
  });

  describe('runtimeVariables 隔离', () => {
    it('输入映射变量只对当前节点生效，不泄漏给下游', async () => {
      const harness = makeHarness({ runtimeVariables: { base_var: 'keep' } });
      sendNetworkRequest.mockResolvedValue(okResponse());

      const nodes = [
        makeNode('step_a', {
          inputs: [{ name: 'x_var', source: { kind: 'literal', value: '1' } }]
        }),
        makeNode('step_b')
      ];
      await runExecuteFlow(
        harness,
        nodes,
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(sendNetworkRequest).toHaveBeenCalledTimes(2);
      const firstVars = sendNetworkRequest.mock.calls[0][3];
      const secondVars = sendNetworkRequest.mock.calls[1][3];
      expect(firstVars).toMatchObject({ base_var: 'keep', x_var: '1' });
      // 下游只保留集合基础变量，不含上游映射变量
      expect(secondVars).toEqual({ base_var: 'keep' });
    });
  });

  describe('并发与初始化防护', () => {
    it('Flow 已在运行中时应拒绝再次执行', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse());

      // 手动把运行态置为 running
      harness.dispatch({
        type: 'flowRun/initFlowRun',
        payload: { flowUid: FLOW_UID, nodes: makeGraph([makeNode('step_a')], []).nodes, cancelTokenUid: 'tok-x' }
      });
      harness.dispatch({
        type: 'flowRun/updateFlowNodeStatus',
        payload: { flowUid: FLOW_UID, stepId: 'step_a', status: NODE_STATUS.RUNNING }
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'end')]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('运行中');
      expect(sendNetworkRequest).not.toHaveBeenCalled();
    });
  });

  describe('运行到此节点', () => {
    it('执行到目标节点后应立即成功结束，后续节点保持 idle', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse());

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')],
        { stopAtNodeId: 'step_a' }
      );

      expect(result.success).toBe(true);
      expect(result.stoppedAt).toBe('step_a');
      expect(sendNetworkRequest).toHaveBeenCalledTimes(1);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.SUCCESS);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.IDLE);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.SUCCESS);
    });
  });

  describe('错误策略 stop', () => {
    it('stop 策略下节点失败后，下游 skipped、流程 failed', async () => {
      const harness = makeHarness();
      let callCount = 0;
      sendNetworkRequest.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({ error: 'ECONNREFUSED' });
        }
        return Promise.resolve(okResponse());
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('ECONNREFUSED');
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.FAILED);
    });

    it('输入映射失败且默认 stop 策略时应终止', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse());

      const result = await runExecuteFlow(
        harness,
        [
          makeNode('step_a', {
            inputs: [{ name: 'v', source: { kind: 'flow', expression: '{{$flow.step_ghost.body.id}}' } }]
          }),
          makeNode('step_b')
        ],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('step_ghost');
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.FAILED);
      expect(sendNetworkRequest).not.toHaveBeenCalled();
    });
  });

  describe('单节点运行', () => {
    it('成功时应更新节点状态并返回成功', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okResponse({ token: 'abc' }));

      const result = await executeSingleNode({
        flowUid: FLOW_UID,
        collectionUid: 'col1',
        flow: makeGraph([makeNode('step_a')], []),
        collection: harness.collection,
        collectionItems: makeCollectionItems('step_a'),
        stepId: 'step_a',
        dispatch: harness.dispatch,
        getState: harness.getState
      });

      expect(result.success).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.SUCCESS);
    });

    it('isCancel 响应应把节点标 cancelled 而非 failed', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue({
        statusText: 'REQUEST_CANCELLED',
        isCancel: true,
        error: 'REQUEST_CANCELLED'
      });

      const result = await executeSingleNode({
        flowUid: FLOW_UID,
        collectionUid: 'col1',
        flow: makeGraph([makeNode('step_a')], []),
        collection: harness.collection,
        collectionItems: makeCollectionItems('step_a'),
        stepId: 'step_a',
        dispatch: harness.dispatch,
        getState: harness.getState
      });

      expect(result.cancelled).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.CANCELLED);
    });

    it('节点不存在时应直接返回失败', async () => {
      const harness = makeHarness();
      const result = await executeSingleNode({
        flowUid: FLOW_UID,
        collectionUid: 'col1',
        flow: makeGraph([makeNode('step_a')], []),
        collection: harness.collection,
        collectionItems: makeCollectionItems('step_a'),
        stepId: 'step_missing',
        dispatch: harness.dispatch,
        getState: harness.getState
      });

      expect(result.success).toBe(false);
      expect(sendNetworkRequest).not.toHaveBeenCalled();
    });
  });

  describe('断言感知', () => {
    const okWithAssertions = (assertionResults, body = { ok: true }) => ({
      ...okResponse(body),
      assertionResults
    });

    it('全部断言通过时节点应为 success 且保存断言明细', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okWithAssertions([
        { uid: 'a1', lhsExpr: 'res.status', operator: 'eq', rhsExpr: '200', status: 'pass' },
        { uid: 'a2', lhsExpr: 'res.body.ok', operator: 'eq', rhsExpr: 'true', status: 'pass' }
      ]));

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'end')]
      );

      expect(result.success).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.SUCCESS);
      const nodeState = harness.getRun().nodes.step_a;
      expect(nodeState.assertionResults).toHaveLength(2);
    });

    it('断言失败时应判定节点 failed 并走 stop 策略', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okWithAssertions([
        { uid: 'a1', lhsExpr: 'res.status', operator: 'eq', rhsExpr: '200', status: 'pass' },
        { uid: 'a2', lhsExpr: 'res.body.code', operator: 'eq', rhsExpr: '0', status: 'fail', error: 'expected 1 to equal 0' }
      ]));

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a'), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('断言失败');
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SKIPPED);
      expect(harness.getRun()?.status).toBe(FLOW_STATUS.FAILED);
      // 断言明细随节点状态保存
      expect(harness.getRun().nodes.step_a.assertionResults).toHaveLength(2);
      // 断言失败时 HTTP 请求已成功，body 应保留供查看
      expect(harness.getRun().nodes.step_a.body).toEqual({ ok: true });
    });

    it('断言失败 + continue 策略时应继续执行下游', async () => {
      const harness = makeHarness();
      let callCount = 0;
      sendNetworkRequest.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve(okWithAssertions([
            { uid: 'a1', lhsExpr: 'res.body.ok', operator: 'eq', rhsExpr: 'true', status: 'fail', error: 'expected false' }
          ]));
        }
        return Promise.resolve(okResponse());
      });

      const result = await runExecuteFlow(
        harness,
        [makeNode('step_a', { errorHandler: { strategy: 'continue' } }), makeNode('step_b')],
        [makeEdge('start', 'step_a'), makeEdge('step_a', 'step_b'), makeEdge('step_b', 'end')]
      );

      expect(result.success).toBe(true);
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(statusOf(harness, 'step_b')).toBe(NODE_STATUS.SUCCESS);
      // 失败节点的响应数据仍在 flowContext，断言明细保留
      expect(harness.getRun().nodes.step_a.assertionResults).toHaveLength(1);
    });

    it('单跑节点断言失败应标 failed（不触发错误策略）', async () => {
      const harness = makeHarness();
      sendNetworkRequest.mockResolvedValue(okWithAssertions([
        { uid: 'a1', lhsExpr: 'res.body.ok', operator: 'eq', rhsExpr: 'true', status: 'fail', error: 'expected false' }
      ]));

      const result = await executeSingleNode({
        flowUid: FLOW_UID,
        collectionUid: 'col1',
        flow: makeGraph([makeNode('step_a')], []),
        collection: harness.collection,
        collectionItems: makeCollectionItems('step_a'),
        stepId: 'step_a',
        dispatch: harness.dispatch,
        getState: harness.getState
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('断言失败');
      expect(statusOf(harness, 'step_a')).toBe(NODE_STATUS.FAILED);
      expect(harness.getRun().nodes.step_a.assertionResults).toHaveLength(1);
    });
  });

  describe('图校验失败', () => {
    it('图缺少 Start 节点时应返回失败且不初始化运行态', async () => {
      const harness = makeHarness();
      const result = await executeFlow({
        flowUid: FLOW_UID,
        collectionUid: 'col1',
        flow: { nodes: [{ id: 'end', type: 'end' }], edges: [] },
        collection: harness.collection,
        collectionItems: {},
        dispatch: harness.dispatch,
        getState: harness.getState
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('图校验失败');
      expect(harness.getRun()).toBeUndefined();
      expect(sendNetworkRequest).not.toHaveBeenCalled();
    });
  });
});
