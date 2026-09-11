/**
 * Flow 运行历史工具测试
 */
import { buildRunRecord } from '../run-history';

describe('buildRunRecord', () => {
  const flowUid = 'flow1';
  const collectionUid = 'col1';
  const startedAt = 1730000000000;

  it('应构建含元信息与节点快照的记录', () => {
    const runState = {
      flowRunId: 'run-1',
      status: 'success',
      nodes: {
        start: { status: 'idle', body: null },
        step_a: {
          status: 'success',
          body: { ok: true },
          httpStatus: 200,
          duration: 120,
          error: null,
          inputVariables: { v: '1' },
          requestSent: { url: 'http://x', method: 'GET' },
          headers: { 'content-type': 'application/json' },
          dataBuffer: null,
          size: 10,
          statusText: 'OK',
          assertionResults: [{ uid: 'a1', lhsExpr: 'res.status', status: 'pass' }]
        }
      }
    };

    const record = buildRunRecord({
      flowUid,
      collectionUid,
      runState,
      startedAt,
      trigger: 'full',
      stopAtNodeId: null,
      status: 'success'
    });

    expect(record.runId).toBe('run-1');
    expect(record.flowUid).toBe(flowUid);
    expect(record.collectionUid).toBe(collectionUid);
    expect(record.startedAt).toBe(startedAt);
    expect(record.trigger).toBe('full');
    expect(record.status).toBe('success');
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.nodes.step_a.httpStatus).toBe(200);
    expect(record.nodes.step_a.assertionResults).toHaveLength(1);
    expect(record.nodes.start.status).toBe('idle');
  });

  it('stop-at 触发应保留目标节点', () => {
    const record = buildRunRecord({
      flowUid,
      collectionUid,
      runState: { flowRunId: 'r2', nodes: {} },
      startedAt,
      trigger: 'stop-at',
      stopAtNodeId: 'step_a',
      status: 'success'
    });
    expect(record.trigger).toBe('stop-at');
    expect(record.stopAtNodeId).toBe('step_a');
  });

  it('超大响应体应截断为文本', () => {
    const bigBody = { data: 'x'.repeat(2 * 1024 * 1024) };
    const record = buildRunRecord({
      flowUid,
      collectionUid,
      runState: {
        flowRunId: 'r3',
        nodes: {
          step_a: { status: 'success', body: bigBody, dataBuffer: 'base64-'.repeat(300 * 1024) }
        }
      },
      startedAt,
      trigger: 'full',
      status: 'success'
    });

    const stored = record.nodes.step_a;
    expect(typeof stored.body).toBe('string');
    expect(stored.body.length).toBeLessThanOrEqual(1024 * 1024);
    expect(stored.dataBuffer).toBeNull();
  });
});
