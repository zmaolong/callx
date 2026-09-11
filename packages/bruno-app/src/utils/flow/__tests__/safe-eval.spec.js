/**
 * 受限表达式求值器测试
 */
import { safeEvaluate } from '../safe-eval';

const ctx = {
  context: {
    step_a: {
      status: 200,
      body: { code: 0, user: { id: 7, name: 'Alice' }, tags: ['x', 'y'] },
      headers: { 'content-type': 'application/json' }
    }
  }
};

describe('safeEvaluate', () => {
  describe('成员访问与作用域', () => {
    it('应支持嵌套成员访问', () => {
      expect(safeEvaluate('context.step_a.status', ctx)).toBe(200);
      expect(safeEvaluate('context.step_a.body.user.name', ctx)).toBe('Alice');
    });

    it('应支持点号与方括号混合访问', () => {
      expect(safeEvaluate('context.step_a.body[\'code\']', ctx)).toBe(0);
      expect(safeEvaluate('context.step_a.body.tags[1]', ctx)).toBe('y');
    });

    it('未注入的标识符应抛错（禁止访问全局）', () => {
      expect(() => safeEvaluate('globalThis', ctx)).toThrow();
      expect(() => safeEvaluate('window', ctx)).toThrow();
      expect(() => safeEvaluate('fetch("http://x")', ctx)).toThrow();
    });

    it('在 null/undefined 上取属性应抛错', () => {
      expect(() => safeEvaluate('context.step_missing.status', ctx)).toThrow();
    });
  });

  describe('运算符', () => {
    it('严格与宽松相等', () => {
      expect(safeEvaluate('context.step_a.status === 200', ctx)).toBe(true);
      expect(safeEvaluate('context.step_a.status == \'200\'', ctx)).toBe(true);
      expect(safeEvaluate('context.step_a.status !== 200', ctx)).toBe(false);
      expect(safeEvaluate('context.step_a.status != 500', ctx)).toBe(true);
    });

    it('数值比较', () => {
      expect(safeEvaluate('context.step_a.status >= 200', ctx)).toBe(true);
      expect(safeEvaluate('context.step_a.status < 300', ctx)).toBe(true);
    });

    it('逻辑运算与三目', () => {
      expect(safeEvaluate('context.step_a.status === 200 && context.step_a.body.code === 0', ctx)).toBe(true);
      expect(safeEvaluate('context.step_a.status === 500 || context.step_a.body.code === 0', ctx)).toBe(true);
      expect(safeEvaluate('!context.step_a.body.code', ctx)).toBe(true);
      expect(safeEvaluate('context.step_a.status === 200 ? "ok" : "bad"', ctx)).toBe('ok');
    });

    it('算术与字符串拼接', () => {
      expect(safeEvaluate('1 + 2 * 3', ctx)).toBe(7);
      expect(safeEvaluate('(1 + 2) * 3', ctx)).toBe(9);
      expect(safeEvaluate('"a" + "b"', ctx)).toBe('ab');
    });
  });

  describe('安全性', () => {
    it('函数调用、赋值、new 应抛错', () => {
      expect(() => safeEvaluate('alert(1)', ctx)).toThrow();
      expect(() => safeEvaluate('context.step_a.status = 1', ctx)).toThrow();
      expect(() => safeEvaluate('new Date()', ctx)).toThrow();
    });

    it('不支持的字符应抛错', () => {
      expect(() => safeEvaluate('context.step_a.status; process.exit(1)', ctx)).toThrow();
      expect(() => safeEvaluate('`template${x}`', ctx)).toThrow();
    });

    it('空表达式应抛错', () => {
      expect(() => safeEvaluate('', ctx)).toThrow();
      expect(() => safeEvaluate(null, ctx)).toThrow();
    });
  });
});
