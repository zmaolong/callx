/**
 * 受限表达式求值器（safe-eval）
 *
 * 用于 Flow 边条件的 JS 表达式模式，替代裸 `new Function`：
 * 只支持无副作用的纯表达式子集，杜绝访问全局对象、调用函数、赋值等能力。
 *
 * 支持的语法：
 * - 字面量：数字、字符串（'…" / "…"）、true / false / null / undefined
 * - 标识符：仅限 scope 中注入的变量（如 context），其余一律拒绝
 * - 成员访问：a.b.c、a['key-x']、a.items[0]
 * - 运算符：! - +（一元）、* / %、+ -、> >= < <=、=== !== == !=、&& ||、三目 ?:
 * - 括号分组
 *
 * 不支持：函数调用、赋值、new、typeof、模板字符串、位运算等。
 * 解析或求值失败时抛出 Error，由调用方决定兜底行为。
 */

const PUNCTUATORS = [
  '===', '!==', '==', '!=', '>=', '<=', '&&', '||',
  '>', '<', '+', '-', '*', '/', '%', '!', '?', ':',
  '.', '(', ')', '[', ']', ','
];

const KEYWORD_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: undefined
};

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    // 空白
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    // 数字
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] || ''))) {
      let j = i;
      while (j < input.length && /[0-9]/.test(input[j])) j += 1;
      if (input[j] === '.') {
        j += 1;
        while (j < input.length && /[0-9]/.test(input[j])) j += 1;
      }
      tokens.push({ type: 'num', value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }

    // 字符串
    if (ch === '\'' || ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < input.length && input[j] !== ch) {
        if (input[j] === '\\') {
          const esc = input[j + 1];
          if (esc === 'n') value += '\n';
          else if (esc === 't') value += '\t';
          else if (esc === 'r') value += '\r';
          else if (esc === undefined) throw new Error('字符串未闭合');
          else value += esc;
          j += 2;
        } else {
          value += input[j];
          j += 1;
        }
      }
      if (j >= input.length) throw new Error('字符串未闭合');
      tokens.push({ type: 'str', value });
      i = j + 1;
      continue;
    }

    // 标识符 / 关键字
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j])) j += 1;
      tokens.push({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }

    // 运算符与标点
    const punct = PUNCTUATORS.find((p) => input.startsWith(p, i));
    if (punct) {
      tokens.push({ type: 'punct', value: punct });
      i += punct.length;
      continue;
    }

    throw new Error(`表达式包含不支持的字符: ${ch}`);
  }

  tokens.push({ type: 'eof', value: null });
  return tokens;
}

const BINARY_PRECEDENCE = {
  '||': 1,
  '&&': 2,
  '===': 3, '!==': 3, '==': 3, '!=': 3,
  '>': 4, '>=': 4, '<': 4, '<=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6
};

/**
 * 宽松相等，覆盖简单条件场景常见的 number/string/bool 混比：
 * - 类型相同 → 严格相等
 * - null/undefined 互相相等
 * - 其余原始类型按 Number() 转换后比较（NaN 不相等）
 */
function looseEquals(a, b) {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return na === nb;
}

class Parser {
  constructor(tokens, scope) {
    this.tokens = tokens;
    this.pos = 0;
    this.scope = scope;
  }

  peek() {
    return this.tokens[this.pos];
  }

  next() {
    const token = this.tokens[this.pos];
    this.pos += 1;
    return token;
  }

  expectPunct(value) {
    const token = this.next();
    if (token.type !== 'punct' || token.value !== value) {
      throw new Error(`期望 "${value}"，实际为 "${token.value}"`);
    }
  }

  parseExpression() {
    return this.parseTernary();
  }

  parseTernary() {
    const cond = this.parseBinary(1);
    if (this.peek().type === 'punct' && this.peek().value === '?') {
      this.next();
      const whenTrue = this.parseExpression();
      this.expectPunct(':');
      const whenFalse = this.parseExpression();
      return cond ? whenTrue : whenFalse;
    }
    return cond;
  }

  parseBinary(minPrecedence) {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'punct') break;
      const precedence = BINARY_PRECEDENCE[token.value];
      if (!precedence || precedence < minPrecedence) break;
      this.next();
      const right = this.parseBinary(precedence + 1);
      left = this.applyBinary(token.value, left, right);
    }
    return left;
  }

  applyBinary(op, left, right) {
    switch (op) {
      case '||': return left || right;
      case '&&': return left && right;
      case '===': return left === right;
      case '!==': return left !== right;
      case '==': return looseEquals(left, right);
      case '!=': return !looseEquals(left, right);
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      default:
        throw new Error(`不支持的运算符: ${op}`);
    }
  }

  parseUnary() {
    const token = this.peek();
    if (token.type === 'punct' && (token.value === '!' || token.value === '-' || token.value === '+')) {
      this.next();
      const value = this.parseUnary();
      if (token.value === '!') return !value;
      if (token.value === '-') return -value;
      return +value;
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let value = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'punct') break;
      if (token.value === '.') {
        this.next();
        const prop = this.next();
        if (prop.type !== 'ident') {
          throw new Error('成员访问 "." 后必须是属性名');
        }
        value = this.accessProperty(value, prop.value);
      } else if (token.value === '[') {
        this.next();
        const index = this.parseExpression();
        this.expectPunct(']');
        value = this.accessProperty(value, index);
      } else {
        break;
      }
    }
    return value;
  }

  accessProperty(target, key) {
    if (target === null || target === undefined) {
      throw new Error(`无法在 ${target} 上访问属性 ${key}`);
    }
    return target[key];
  }

  parsePrimary() {
    const token = this.next();

    if (token.type === 'num' || token.type === 'str') {
      return token.value;
    }

    if (token.type === 'ident') {
      if (token.value in KEYWORD_VALUES) {
        return KEYWORD_VALUES[token.value];
      }
      if (Object.prototype.hasOwnProperty.call(this.scope, token.value)) {
        return this.scope[token.value];
      }
      throw new Error(`表达式不允许访问标识符: ${token.value}`);
    }

    if (token.type === 'punct' && token.value === '(') {
      const value = this.parseExpression();
      this.expectPunct(')');
      return value;
    }

    throw new Error(`表达式包含不支持的语法: ${token.value}`);
  }
}

/**
 * 安全求值一个表达式。
 *
 * @param {string} expression 表达式字符串
 * @param {Object} scope 注入的变量（如 { context: flowContext }）
 * @returns {*} 求值结果
 * @throws {Error} 语法不支持或求值失败
 */
export function safeEvaluate(expression, scope = {}) {
  if (typeof expression !== 'string' || !expression.trim()) {
    throw new Error('表达式不能为空');
  }
  const parser = new Parser(tokenize(expression), scope);
  const result = parser.parseExpression();
  if (parser.peek().type !== 'eof') {
    throw new Error('表达式存在多余内容');
  }
  return result;
}
