/**
 * 输入映射解析测试
 */
import {
  validateInputMapping,
  validateInputMappings,
  resolveInputMapping,
  resolveInputMappings
} from '../input-mapping';

describe('validateInputMapping', () => {
  it('合法 flow 映射应通过', () => {
    const mapping = {
      name: 'userId',
      source: {
        kind: 'flow',
        expression: '{{$flow.step_a.body.user.id}}'
      }
    };
    expect(validateInputMapping(mapping).valid).toBe(true);
  });

  it('合法 literal 映射应通过', () => {
    const mapping = {
      name: 'retryCount',
      source: {
        kind: 'literal',
        value: 3,
        valueType: 'number'
      }
    };
    expect(validateInputMapping(mapping).valid).toBe(true);
  });

  it('空变量名不通过', () => {
    expect(validateInputMapping({ name: '', source: { kind: 'literal', value: 1 } }).valid).toBe(false);
    expect(validateInputMapping({ source: { kind: 'literal', value: 1 } }).valid).toBe(false);
  });

  it('不支持的来源类型不通过', () => {
    const mapping = {
      name: 'x',
      source: { kind: 'unknown', value: 1 }
    };
    expect(validateInputMapping(mapping).valid).toBe(false);
  });

  it('flow 来源缺少表达式不通过', () => {
    const mapping = {
      name: 'x',
      source: { kind: 'flow' }
    };
    const result = validateInputMapping(mapping);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expression');
  });
});

describe('validateInputMappings', () => {
  it('空数组应返回空错误', () => {
    expect(validateInputMappings([])).toEqual([]);
  });

  it('非数组应返回错误', () => {
    const errors = validateInputMappings(null);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('应返回所有映射错误', () => {
    const mappings = [
      { name: 'a', source: { kind: 'literal', value: 1 } },
      { name: '', source: { kind: 'literal', value: 2 } }
    ];
    const errors = validateInputMappings(mappings);
    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
  });
});

describe('resolveInputMapping', () => {
  const flowContext = {
    _nodeResults: {
      step_a: {
        body: { user: { id: 123, name: 'Alice' } },
        status: 200,
        duration: 100
      }
    },
    _edges: [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'step_b' }
    ]
  };

  it('literal 保留原始类型', () => {
    expect(resolveInputMapping({ name: 'x', source: { kind: 'literal', value: 42, valueType: 'number' } }, {}))
      .toEqual({ name: 'x', value: 42 });
    expect(resolveInputMapping({ name: 'x', source: { kind: 'literal', value: 'hello', valueType: 'string' } }, {}))
      .toEqual({ name: 'x', value: 'hello' });
    expect(resolveInputMapping({ name: 'x', source: { kind: 'literal', value: true, valueType: 'boolean' } }, {}))
      .toEqual({ name: 'x', value: true });
    expect(resolveInputMapping({ name: 'x', source: { kind: 'literal', value: null, valueType: 'null' } }, {}))
      .toEqual({ name: 'x', value: null });
  });

  it('literal 应解析 JSON', () => {
    const result = resolveInputMapping(
      { name: 'data', source: { kind: 'literal', value: '{"a":1}', valueType: 'json' } },
      {}
    );
    expect(result).toEqual({ name: 'data', value: { a: 1 } });
  });

  it('flow 来源应从 flowContext 中取值', () => {
    const result = resolveInputMapping(
      { name: 'userId', source: { kind: 'flow', expression: '{{$flow.step_a.body.user.id}}' } },
      flowContext,
      'step_b'
    );
    expect(result).toEqual({ name: 'userId', value: 123, stepId: 'step_a' });
  });

  it('flow 来源不存在的节点应返回错误', () => {
    const result = resolveInputMapping(
      { name: 'x', source: { kind: 'flow', expression: '{{$flow.missing.body}}' } },
      flowContext
    );
    expect(result.error).toBeDefined();
  });
});

describe('resolveInputMappings', () => {
  const flowContext = {
    _nodeResults: {
      step_a: {
        body: { token: 'abc' },
        status: 200,
        duration: 100
      }
    },
    _edges: [
      { id: 'e1', source: 'start', target: 'step_a' },
      { id: 'e2', source: 'step_a', target: 'step_b' }
    ]
  };

  it('应返回合并的 variables 对象', () => {
    const mappings = [
      { name: 'token', source: { kind: 'flow', expression: '{{$flow.step_a.body.token}}' } },
      { name: 'timeout', source: { kind: 'literal', value: 5000, valueType: 'number' } }
    ];
    const { variables, errors } = resolveInputMappings(mappings, flowContext, 'step_b');
    expect(variables).toEqual({ token: 'abc', timeout: 5000 });
    expect(errors).toHaveLength(0);
  });

  it('映射失败时应返回错误', () => {
    const mappings = [
      { name: 'bad', source: { kind: 'flow', expression: '{{$flow.missing.body}}' } }
    ];
    const { variables, errors } = resolveInputMappings(mappings, flowContext);
    expect(variables).toEqual({});
    expect(errors).toHaveLength(1);
    expect(errors[0].variableName).toBe('bad');
  });

  it('非数组 mappings 应返回空结果', () => {
    const { variables, errors } = resolveInputMappings(null, {});
    expect(variables).toEqual({});
    expect(errors).toEqual([]);
  });
});
