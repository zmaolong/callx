/**
 * Flow 表达式解析与求值测试
 */
import {
  parseFlowExpression,
  validateFlowExpression,
  evaluateFlowExpression,
  evaluateLastExpression,
  evaluateCondition,
  selectBranch
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

  it('应支持 status/statusText/headers/duration 根字段', () => {
    expect(parseFlowExpression('{{$flow.step_abc.status}}')).toEqual({ stepId: 'step_abc', path: 'status' });
    expect(parseFlowExpression('{{$flow.step_abc.statusText}}')).toEqual({ stepId: 'step_abc', path: 'statusText' });
    expect(parseFlowExpression('{{$flow.step_abc.duration}}')).toEqual({ stepId: 'step_abc', path: 'duration' });
    expect(parseFlowExpression('{{$flow.step_abc.headers.content-type}}')).toEqual({
      stepId: 'step_abc',
      path: 'headers.content-type'
    });
  });

  it('不支持的根字段应返回 null', () => {
    expect(parseFlowExpression('{{$flow.step_abc.data}}')).toBeNull();
    expect(parseFlowExpression('{{$flow.step_abc.response}}')).toBeNull();
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

  it('应校验根字段范围', () => {
    expect(validateFlowExpression('{{$flow.step_abc.status}}').valid).toBe(true);
    expect(validateFlowExpression('{{$flow.step_abc.headers.x-token}}').valid).toBe(true);
    const invalid = validateFlowExpression('{{$flow.step_abc.data.x}}');
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('body/status');
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

  it('应支持 status/headers/duration 等元信息路径', () => {
    expect(evaluateFlowExpression('{{$flow.step_a.status}}', nodeResults)).toEqual({ value: 200, stepId: 'step_a' });
    expect(evaluateFlowExpression('{{$flow.step_a.duration}}', nodeResults)).toEqual({ value: 100, stepId: 'step_a' });
    const withHeaders = {
      step_a: { body: {}, status: 200, duration: 100, headers: { 'content-type': 'application/json' } }
    };
    expect(evaluateFlowExpression('{{$flow.step_a.headers.content-type}}', withHeaders)).toEqual({
      value: 'application/json',
      stepId: 'step_a'
    });
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

describe('evaluateCondition', () => {
  const flowContext = {
    step_a: {
      body: { code: 0, user: { name: 'Alice' } },
      status: 200,
      duration: 100
    }
  };

  it('无条件（null）应视为默认分支恒真', () => {
    expect(evaluateCondition(null, flowContext)).toBe(true);
    expect(evaluateCondition(undefined, flowContext)).toBe(true);
  });

  it('简单条件各运算符', () => {
    expect(evaluateCondition({ field: 'step_a.status', operator: 'eq', value: 200 }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.status', operator: 'eq', value: '200' }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.status', operator: 'ne', value: 200 }, flowContext)).toBe(false);
    expect(evaluateCondition({ field: 'step_a.status', operator: 'gt', value: 199 }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.status', operator: 'lte', value: 200 }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.body.user.name', operator: 'contains', value: 'lic' }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.status', operator: 'regex', value: '^2' }, flowContext)).toBe(true);
    expect(evaluateCondition({ field: 'step_a.body.code', operator: 'eq', value: 0 }, flowContext)).toBe(true);
  });

  it('字段缺失时应返回 false 而非抛错', () => {
    expect(evaluateCondition({ field: 'step_ghost.status', operator: 'eq', value: 200 }, flowContext)).toBe(false);
  });

  it('未知运算符应返回 false', () => {
    expect(evaluateCondition({ field: 'step_a.status', operator: 'frobnicate', value: 1 }, flowContext)).toBe(false);
  });

  it('JS 表达式条件应通过受限求值器执行', () => {
    expect(evaluateCondition({ expression: 'context.step_a.status === 200' }, flowContext)).toBe(true);
    expect(evaluateCondition({ expression: 'context.step_a.body.code === 0' }, flowContext)).toBe(true);
    expect(evaluateCondition({ expression: 'context.step_a.status === 500' }, flowContext)).toBe(false);
  });

  it('JS 表达式访问未注入标识符应返回 false（禁止全局访问）', () => {
    expect(evaluateCondition({ expression: 'globalThis.foo === 1' }, flowContext)).toBe(false);
    expect(evaluateCondition({ expression: 'fetch("http://evil")' }, flowContext)).toBe(false);
  });

  it('JS 表达式语法错误应返回 false', () => {
    expect(evaluateCondition({ expression: 'context.step_a.status ===' }, flowContext)).toBe(false);
  });
});

describe('selectBranch', () => {
  const flowContext = { step_a: { status: 200, body: { ok: true } } };

  const edge = (target, condition) => ({ id: `e_${target}`, source: 'step_a', target, condition });

  it('应优先选择满足条件的第一条边', () => {
    const edges = [edge('step_b', { field: 'step_a.status', operator: 'eq', value: 200 }), edge('step_c')];
    expect(selectBranch(edges, flowContext).target).toBe('step_b');
  });

  it('条件都不满足时应走无条件默认边', () => {
    const edges = [edge('step_b', { field: 'step_a.status', operator: 'eq', value: 500 }), edge('step_c')];
    expect(selectBranch(edges, flowContext).target).toBe('step_c');
  });

  it('只有条件边且都不满足时应返回 null', () => {
    const edges = [
      edge('step_b', { field: 'step_a.status', operator: 'eq', value: 500 }),
      edge('step_c', { field: 'step_a.status', operator: 'eq', value: 404 })
    ];
    expect(selectBranch(edges, flowContext)).toBeNull();
  });

  it('空出边列表应返回 null', () => {
    expect(selectBranch([], flowContext)).toBeNull();
    expect(selectBranch(null, flowContext)).toBeNull();
  });
});
