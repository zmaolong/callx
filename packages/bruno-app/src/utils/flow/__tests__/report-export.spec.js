/**
 * 运行报告导出测试：脱敏、数据构建、双格式渲染
 */
import {
  sanitizeHeaders,
  buildReportData,
  renderMarkdown,
  renderHtml
} from '../report-export';

const makeRunState = () => ({
  flowRunId: 'run-1',
  status: 'failed',
  startedAt: 1730000000000,
  finishedAt: 1730000005000,
  durationMs: 5000,
  trigger: 'full',
  nodes: {
    start: { status: 'idle', body: null },
    step_a: {
      status: 'success',
      httpStatus: 200,
      duration: 120,
      body: { ok: true },
      requestSent: {
        method: 'GET',
        url: 'http://test/api',
        headers: {
          'Authorization': 'Bearer secret-token',
          'Cookie': 'session=abc',
          'X-Api-Key': 'key-123',
          'Content-Type': 'application/json'
        }
      },
      inputVariables: { userId: 42 },
      assertionResults: [
        { lhsExpr: 'res.status', operator: 'eq', rhsExpr: '200', status: 'pass' },
        { lhsExpr: 'res.body.ok', operator: 'eq', rhsExpr: 'true', status: 'fail', error: 'expected true' }
      ]
    },
    loop1: {
      status: 'success',
      loopProgress: { current: 3, total: 3, collectedCount: 5 },
      rounds: [
        { index: 0, item: 'a', status: 'success', error: null, durationMs: 10 },
        { index: 1, item: 'b', status: 'failed', error: '断言失败', durationMs: 20 },
        { index: 2, item: 'c', status: 'success', error: null, durationMs: 30 }
      ]
    }
  }
});

describe('sanitizeHeaders', () => {
  it('默认应脱敏常见敏感头（大小写不敏感）', () => {
    const masked = sanitizeHeaders({
      'Authorization': 'Bearer x',
      'cookie': 'a=1',
      'SET-COOKIE': 'b=2',
      'x-api-key': 'k',
      'Content-Type': 'application/json'
    });
    expect(masked.Authorization).toBe('***');
    expect(masked.cookie).toBe('***');
    expect(masked['SET-COOKIE']).toBe('***');
    expect(masked['x-api-key']).toBe('***');
    expect(masked['Content-Type']).toBe('application/json');
  });

  it('unmask: true 应保留原值', () => {
    const headers = { Authorization: 'Bearer x' };
    expect(sanitizeHeaders(headers, { unmask: true }).Authorization).toBe('Bearer x');
  });

  it('空值应原样返回', () => {
    expect(sanitizeHeaders(null)).toBeNull();
  });
});

describe('buildReportData', () => {
  it('应构建含摘要与步骤明细的报告数据', () => {
    const report = buildReportData({ flowName: '下单链路', run: makeRunState() });
    expect(report.flowName).toBe('下单链路');
    expect(report.statusLabel).toBe('失败');
    expect(report.summary).toEqual({ total: 2, executed: 2, success: 2, failed: 0, skipped: 0 });
    expect(report.steps).toHaveLength(2);

    const stepA = report.steps.find((s) => s.stepId === 'step_a');
    expect(stepA.assertions.pass).toBe(1);
    expect(stepA.assertions.total).toBe(2);
    // 敏感头默认脱敏
    expect(stepA.requestSent.headers.Authorization).toBe('***');
    expect(stepA.requestSent.headers['Content-Type']).toBe('application/json');

    const loopStep = report.steps.find((s) => s.stepId === 'loop1');
    expect(loopStep.loop.total).toBe(3);
    expect(loopStep.loop.collectedCount).toBe(5);
    expect(loopStep.loop.rounds).toHaveLength(3);
  });

  it('unmask: true 时报告数据应包含完整敏感头', () => {
    const report = buildReportData({ flowName: 'x', run: makeRunState(), unmask: true });
    expect(report.steps.find((s) => s.stepId === 'step_a').requestSent.headers.Authorization).toBe('Bearer secret-token');
  });

  it('超大响应体应截断并提示', () => {
    const run = makeRunState();
    run.nodes.step_a.body = 'x'.repeat(5000);
    const report = buildReportData({ flowName: 'x', run });
    expect(report.steps.find((s) => s.stepId === 'step_a').bodyPreview).toContain('已截断');
  });
});

describe('renderMarkdown', () => {
  it('应包含摘要与步骤区块', () => {
    const report = buildReportData({ flowName: '下单链路', run: makeRunState() });
    const md = renderMarkdown(report);
    expect(md).toContain('# 下单链路 运行报告');
    expect(md).toContain('**失败**');
    expect(md).toContain('## 1. ✅ step_a');
    expect(md).toContain('断言（1/2 通过）');
    expect(md).toContain('| 请求头 | 值 |');
    expect(md).not.toContain('Bearer secret-token');
    expect(md).toContain('***');
  });

  it('循环步骤应包含轮次表格', () => {
    const report = buildReportData({ flowName: 'x', run: makeRunState() });
    const md = renderMarkdown(report);
    expect(md).toContain('### 迭代轮次');
    expect(md).toContain('断言失败');
  });
});

describe('renderHtml', () => {
  it('应是自包含 HTML 且默认脱敏', () => {
    const report = buildReportData({ flowName: '下单链路', run: makeRunState() });
    const html = renderHtml(report);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('下单链路 运行报告');
    expect(html).toContain('step success');
    expect(html).not.toContain('Bearer secret-token');
    expect(html).toContain('***');
  });
});
