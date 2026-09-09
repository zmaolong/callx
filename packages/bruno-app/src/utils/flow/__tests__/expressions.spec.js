/**
 * Flow 表达式解析与求值测试
 */
import {
  parseFlowExpression,
  validateFlowExpression,
  evaluateFlowExpression,
  evaluateLastExpression
} from '../expressions';

describe('parseFlowExpression', () => {
  it('应解析 {{$flow.step_abc.body.user.id}} 格式', () => {
    const result = parseFlowExpression('{{$flow.step_abc.body.user.id}}');
    expect(result).toEqual({ stepId: 'step_abc', path: 'body.user.id' });
  });

  it('应解析 {{$flow.last.body.token}} 格式', () => {
    const result = parseFlowExpression('{{$flow.last.body.token}}');
    expect(result).toEqual({ stepId: 'last', path: 'body.token' });
  });

  it('body 后面无路径应返回空字符串路径', () => {
    const result = parseFlowExpression('{{$flow.step_abc.body}}');
    expect(result).toEqual({ stepId: 'step_abc', path: 'body' });
  });

  it('非 $flow 前缀表达式应返回 null', () => {
    expect(parseFlowExpression('{{env.API_KEY}}')).toBeNull();
    expect(parseFlowExpression('{{$flow}}')).toBeNull();
  });

  it('缺少 body 前缀应返回 null', () => {
    expect(parseFlowExpression('{{$flow.step_abc.data}}')).toBeNull();
  });

  it('无 {{}} 包裹应返回 null', () => {
    expect(parseFlowExpression('$flow.step_abc.body')).toBeNull();
    expect(parseFlowExpression('')).toBeNull();
    expect(parseFlowExpression(null)).toBeNull();
  });

  it('混合模板应返回 null', () => {
    expect(parseFlowExpression('token-{{$flow.step_abc.body.id}}')).toBeNull();
  });
});

describe('validateFlowExpression', () => {
  it('合法表达式应通过', () => {
    expect(validateFlowExpression('{{$flow.step_abc.body.id}}').valid).toBe(true);
    expect(validateFlowExpression('{{$flow.last.body}}').valid).toBe(true);
  });

  it('空表达式不通过', () => {
    expect(validateFlowExpression('').valid).toBe(false);
    expect(validateFlowExpression(null).valid).toBe(false);
  });

  it('混合模板不通过', () => {
    const result = validateFlowExpression('x-{{$flow.step.body.id}}');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('必须被 {{ 和 }} 包裹');
  });

  it('非 $flow 前缀不通过', () => {
    const result = validateFlowExpression('{{env.API_KEY}}');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('$flow');
  });

  it('缺少 body 路径不通过', () => {
    const result = validateFlowExpression('{{$flow.step_abc}}');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('stepId');
  });
});

describe('evaluateFlowExpression', () => {
  const nodeResults = {
    step_a: {
      body: { user: { id: 123, name: 'Alice' }, items: [{ id: 1 }, { id: 2 }] },
      status: 200,
      duration: 100
    },
    step_b: {
      body: 'plain text response',
      status: 200,
      duration: 50
    }
  };

  it('应在 flowContext 中查找并取值', () => {
    const result = evaluateFlowExpression('{{$flow.step_a.body.user.id}}', nodeResults);
    expect(result).toEqual({ value: 123, stepId: 'step_a' });
  });

  it('应支持嵌套路径', () => {
    const result = evaluateFlowExpression('{{$flow.step_a.body.items[0].id}}', nodeResults);
    expect(result).toEqual({ value: 1, stepId: 'step_a' });
  });

  it('不存在的 stepId 应返回 null', () => {
    const result = evaluateFlowExpression('{{$flow.nonexistent.body}}', nodeResults);
    expect(result).toBeNull();
  });

  it('路径不存在应返回 value 为 undefined', () => {
    const result = evaluateFlowExpression('{{$flow.step_a.body.missing.key}}', nodeResults);
    expect(result).toEqual({ value: undefined, stepId: 'step_a' });
  });

  it('$flow.last 表达式应返回 null（由调用方处理）', () => {
    const result = evaluateFlowExpression('{{$flow.last.body.token}}', nodeResults);
    expect(result).toBeNull();
  });

  it('文本类型 body 应正确返回', () => {
    const result = evaluateFlowExpression('{{$flow.step_b.body}}', nodeResults);
    expect(result).toEqual({ value: 'plain text response', stepId: 'step_b' });
  });
});

describe('evaluateLastExpression', () => {
  const flowContext = {
    step_a: {
      body: { token: 'abc123' },
      status: 200,
      duration: 100
    }
  };

  const getPredecessor = (stepId) => {
    if (stepId === 'step_b') return 'step_a';
    return null;
  };

  it('应解析前一节点的 body', () => {
    const result = evaluateLastExpression('step_b', getPredecessor, flowContext, 'body.token');
    expect(result).toEqual({ value: 'abc123', stepId: 'step_a' });
  });

  it('无前驱时应返回 null', () => {
    const result = evaluateLastExpression('step_a', getPredecessor, flowContext, 'body.token');
    expect(result).toBeNull();
  });
});
