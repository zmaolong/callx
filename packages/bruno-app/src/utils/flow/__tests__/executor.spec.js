/**
 * Flow 执行器测试
 */
import { NODE_STATUS, FLOW_STATUS } from 'providers/ReduxStore/slices/flowRun';

// 模拟 sendNetworkRequest
jest.mock('utils/network/index', () => ({
  sendNetworkRequest: jest.fn(),
  cancelNetworkRequest: jest.fn()
}));

const mockSendNetworkRequest = require('utils/network/index').sendNetworkRequest;

describe('Flow 执行器核心逻辑', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveMainChain（集成测试）', () => {
    const { resolveMainChain } = require('utils/flow/graph');

    const makeNodes = (extraNodes = []) => [
      { id: 'start', type: 'start' },
      { id: 'end', type: 'end' },
      ...extraNodes
    ];

    const makeEdges = (pairs) =>
      pairs.map(([source, target]) => ({ id: `edge_${source}_${target}`, source, target }));

    it('合法 Start → A → B → End 应解析出正确顺序', () => {
      const nodes = makeNodes([
        { id: 'step_a', type: 'request' },
        { id: 'step_b', type: 'request' }
      ]);
      const edges = makeEdges([
        ['start', 'step_a'],
        ['step_a', 'step_b'],
        ['step_b', 'end']
      ]);
      expect(resolveMainChain(nodes, edges)).toEqual(['step_a', 'step_b']);
    });

    it('无连线时应返回空数组', () => {
      const nodes = makeNodes([{ id: 'step_a', type: 'request' }]);
      expect(resolveMainChain(nodes, [])).toEqual([]);
    });

    it('未连接节点不参与主链', () => {
      const nodes = makeNodes([
        { id: 'step_a', type: 'request' },
        { id: 'step_b', type: 'request' }
      ]);
      const edges = makeEdges([
        ['start', 'step_a'],
        ['step_a', 'end']
      ]);
      expect(resolveMainChain(nodes, edges)).toEqual(['step_a']);
    });
  });

  describe('状态流转', () => {
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
});
