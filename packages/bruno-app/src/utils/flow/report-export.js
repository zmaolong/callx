/**
 * Flow 运行报告导出
 *
 * 从运行记录（flowRun 实时运行态或历史记录，二者节点态结构一致）构建报告数据，
 * 渲染为 Markdown 与自包含单文件 HTML 两种格式，经 IPC
 * `flow-report:export` 保存（主进程弹保存对话框，按扩展名选择内容落盘）。
 *
 * 脱敏：默认对常见敏感请求头打码（Authorization/Cookie/Set-Cookie/X-API-Key），
 * 调用方可选择包含完整信息。
 */
export const SENSITIVE_HEADER_PATTERNS = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

// 报告中响应体节选上限（字符），控制报告体积
const BODY_PREVIEW_MAX = 2000;

const STATUS_LABELS = {
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
  running: '运行中',
  idle: '未执行',
  skipped: '已跳过'
};

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatDuration = (ms) => (ms === null || ms === undefined ? '-' : `${ms}ms`);

const stringifyBody = (body) => {
  if (body === null || body === undefined) return '';
  let text;
  try {
    text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  } catch {
    text = String(body);
  }
  if (text.length > BODY_PREVIEW_MAX) {
    return `${text.slice(0, BODY_PREVIEW_MAX)}\n…（已截断，完整内容见运行历史）`;
  }
  return text;
};

/**
 * 请求头脱敏：敏感头的值替换为 ***（保留键名，体现"该头存在且被隐藏"）。
 */
export function sanitizeHeaders(headers, { unmask = false } = {}) {
  if (!headers || typeof headers !== 'object') return headers;
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const sensitive = !unmask && SENSITIVE_HEADER_PATTERNS.some((p) => key.toLowerCase().includes(p));
    result[key] = sensitive ? '***' : value;
  }
  return result;
}

const summarizeAssertion = (assertion) => ({
  expr: `${assertion.lhsExpr || ''} ${assertion.operator || ''} ${assertion.rhsExpr || ''}`.trim(),
  status: assertion.status,
  error: assertion.error || ''
});

/**
 * 从运行记录构建报告数据。
 *
 * @param {Object} options
 * @param {string} options.flowName Flow 名称
 * @param {Object} options.run 运行态/历史记录（含 nodes；其余元信息可选）
 * @param {boolean} [options.unmask] true 时包含完整敏感头
 * @returns {Object} 报告数据
 */
export function buildReportData({ flowName, run, unmask = false }) {
  const nodes = run?.nodes || {};
  const stepEntries = Object.entries(nodes).filter(([stepId]) => stepId !== 'start' && stepId !== 'end');

  let totalDuration = 0;
  let executedCount = 0;
  const steps = stepEntries.map(([stepId, state]) => {
    if (state.duration != null && state.duration > 0) totalDuration += state.duration;
    if (state.status !== 'idle') executedCount += 1;

    const assertions = Array.isArray(state.assertionResults) ? state.assertionResults : [];
    const rounds = Array.isArray(state.rounds) ? state.rounds : null;

    return {
      stepId,
      name: state.requestSent?.alias || stepId,
      status: state.status || 'idle',
      statusLabel: STATUS_LABELS[state.status] || state.status || '-',
      httpStatus: state.httpStatus ?? null,
      duration: state.duration ?? null,
      error: state.error || null,
      assertions: assertions.length > 0
        ? {
            pass: assertions.filter((a) => a.status === 'pass').length,
            total: assertions.length,
            items: assertions.map(summarizeAssertion)
          }
        : null,
      requestSent: state.requestSent
        ? {
            method: state.requestSent.method || '',
            url: state.requestSent.url || '',
            headers: sanitizeHeaders(state.requestSent.headers, { unmask })
          }
        : null,
      inputVariables: state.inputVariables && Object.keys(state.inputVariables).length > 0
        ? state.inputVariables
        : null,
      bodyPreview: state.body !== null && state.body !== undefined ? stringifyBody(state.body) : '',
      loop: state.loopProgress
        ? {
            current: state.loopProgress.current,
            total: state.loopProgress.total,
            collectedCount: state.loopProgress.collectedCount || 0,
            rounds
          }
        : null
    };
  });

  const failedCount = steps.filter((s) => s.status === 'failed').length;

  return {
    title: `${flowName || 'Flow'} 运行报告`,
    flowName: flowName || '-',
    runId: run?.runId || '-',
    status: run?.status || 'unknown',
    statusLabel: STATUS_LABELS[run?.status] || run?.status || '-',
    trigger: run?.trigger === 'stop-at' ? '运行到此' : '整链运行',
    stopAtNodeId: run?.stopAtNodeId || null,
    startedAt: run?.startedAt || null,
    finishedAt: run?.finishedAt || null,
    startedAtLabel: formatTime(run?.startedAt),
    finishedAtLabel: formatTime(run?.finishedAt),
    durationMs: run?.durationMs ?? (run?.startedAt ? null : totalDuration),
    totalDurationMs: totalDuration,
    steps,
    summary: {
      total: steps.length,
      executed: executedCount,
      success: steps.filter((s) => s.status === 'success').length,
      failed: failedCount,
      skipped: steps.filter((s) => s.status === 'skipped').length
    },
    generatedAtLabel: formatTime(Date.now())
  };
}

const mdEscape = (text) => String(text ?? '').replace(/\|/g, '\\|');

const mdCode = (text) => (text ? `\n\`\`\`\n${text}\n\`\`\`\n` : '');

/**
 * 渲染 Markdown 报告。
 */
export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# ${report.title}`);
  lines.push('');
  lines.push(`- 结果：**${report.statusLabel}**`);
  lines.push(`- Flow：${report.flowName}`);
  lines.push(`- 触发：${report.trigger}${report.stopAtNodeId ? `（目标 ${report.stopAtNodeId}）` : ''}`);
  if (report.startedAt) {
    lines.push(`- 时间：${report.startedAtLabel} → ${report.finishedAtLabel}`);
  }
  lines.push(`- 步骤：${report.summary.executed}/${report.summary.total}（成功 ${report.summary.success} / 失败 ${report.summary.failed} / 跳过 ${report.summary.skipped}）`);
  lines.push(`- 总耗时：${formatDuration(report.totalDurationMs)}`);
  lines.push(`- 生成时间：${report.generatedAtLabel}`);
  lines.push('');

  for (const [index, step] of report.steps.entries()) {
    const badge = step.status === 'failed' ? '❌' : step.status === 'success' ? '✅' : step.status === 'cancelled' ? '🚫' : '⏭️';
    lines.push(`## ${index + 1}. ${badge} ${mdEscape(step.name)}`);
    lines.push('');
    lines.push(`- 状态：${step.statusLabel}`);
    if (step.httpStatus !== null) lines.push(`- HTTP：${step.httpStatus}`);
    if (step.duration !== null) lines.push(`- 耗时：${formatDuration(step.duration)}`);
    if (step.loop) {
      lines.push(`- 迭代：${step.loop.current}/${step.loop.total}${step.loop.collectedCount ? `（收集 ${step.loop.collectedCount} 项）` : ''}`);
    }
    if (step.error) {
      lines.push(`- 错误：${step.error}`);
    }
    lines.push('');

    if (step.loop?.rounds?.length) {
      lines.push('### 迭代轮次');
      lines.push('');
      lines.push('| 轮次 | 状态 | item | 耗时 | 错误 |');
      lines.push('| --- | --- | --- | --- | --- |');
      for (const round of step.loop.rounds) {
        lines.push(`| ${round.index + 1} | ${STATUS_LABELS[round.status] || round.status} | ${mdEscape(round.item)} | ${formatDuration(round.durationMs)} | ${mdEscape(round.error || '')} |`);
      }
      lines.push('');
    }

    if (step.assertions) {
      lines.push(`### 断言（${step.assertions.pass}/${step.assertions.total} 通过）`);
      lines.push('');
      for (const assertion of step.assertions.items) {
        lines.push(`- ${assertion.status === 'pass' ? '✅' : '❌'} ${mdEscape(assertion.expr)}${assertion.error ? ` — ${mdEscape(assertion.error)}` : ''}`);
      }
      lines.push('');
    }

    if (step.requestSent) {
      lines.push('### 请求');
      lines.push('');
      lines.push(`\`${step.requestSent.method} ${step.requestSent.url}\``);
      lines.push('');
      const headerEntries = Object.entries(step.requestSent.headers || {});
      if (headerEntries.length > 0) {
        lines.push('| 请求头 | 值 |');
        lines.push('| --- | --- |');
        for (const [key, value] of headerEntries) {
          lines.push(`| ${mdEscape(key)} | ${mdEscape(String(value))} |`);
        }
        lines.push('');
      }
    }

    if (step.inputVariables) {
      lines.push('### 输入变量');
      lines.push('');
      mdCode(JSON.stringify(step.inputVariables, null, 2)).split('\n').forEach((l) => lines.push(l));
    }

    if (step.bodyPreview) {
      lines.push('### 响应体（节选）');
      lines.push('');
      mdCode(step.bodyPreview).split('\n').forEach((l) => lines.push(l));
    }
  }

  return lines.join('\n');
}

const htmlEscape = (text) => String(text ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/**
 * 渲染自包含单文件 HTML 报告（内联样式，浏览器直接打开）。
 */
export function renderHtml(report) {
  const stepSections = report.steps.map((step, index) => {
    const statusClass = step.status === 'failed' ? 'failed' : step.status === 'success' ? 'success' : 'other';
    const metaParts = [];
    if (step.httpStatus !== null) metaParts.push(`HTTP ${htmlEscape(String(step.httpStatus))}`);
    if (step.duration !== null) metaParts.push(htmlEscape(formatDuration(step.duration)));
    if (step.loop) {
      metaParts.push(`迭代 ${step.loop.current}/${step.loop.total}${step.loop.collectedCount ? ` · 收集 ${step.loop.collectedCount} 项` : ''}`);
    }

    let inner = '';
    if (step.error) {
      inner += `<div class="error">${htmlEscape(step.error)}</div>`;
    }
    if (step.loop?.rounds?.length) {
      inner += `<h4>迭代轮次</h4><table><tr><th>轮次</th><th>状态</th><th>item</th><th>耗时</th><th>错误</th></tr>${
        step.loop.rounds.map((round) => `<tr><td>${round.index + 1}</td><td>${htmlEscape(STATUS_LABELS[round.status] || round.status)}</td><td>${htmlEscape(round.item)}</td><td>${htmlEscape(formatDuration(round.durationMs))}</td><td>${htmlEscape(round.error || '')}</td></tr>`).join('')
      }</table>`;
    }
    if (step.assertions) {
      inner += `<h4>断言（${step.assertions.pass}/${step.assertions.total} 通过）</h4><ul>${
        step.assertions.items.map((a) => `<li class="${a.status === 'pass' ? 'pass' : 'fail'}">${htmlEscape(a.expr)}${a.error ? ` — ${htmlEscape(a.error)}` : ''}</li>`).join('')
      }</ul>`;
    }
    if (step.requestSent) {
      const headerRows = Object.entries(step.requestSent.headers || {})
        .map(([key, value]) => `<tr><td>${htmlEscape(key)}</td><td>${htmlEscape(String(value))}</td></tr>`)
        .join('');
      inner += `<h4>请求</h4><p><code>${htmlEscape(`${step.requestSent.method} ${step.requestSent.url}`)}</code></p>${
        headerRows ? `<table><tr><th>请求头</th><th>值</th></tr>${headerRows}</table>` : ''
      }`;
    }
    if (step.inputVariables) {
      inner += `<h4>输入变量</h4><pre>${htmlEscape(JSON.stringify(step.inputVariables, null, 2))}</pre>`;
    }
    if (step.bodyPreview) {
      inner += `<h4>响应体（节选）</h4><pre>${htmlEscape(step.bodyPreview)}</pre>`;
    }

    return `<section class="step ${statusClass}">
  <h3><span class="dot"></span>${index + 1}. ${htmlEscape(step.name)}</h3>
  <div class="meta"><span class="badge ${statusClass}">${htmlEscape(step.statusLabel)}</span>${metaParts.map((m) => `<span>${m}</span>`).join('')}</div>
  ${inner}
</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${htmlEscape(report.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; line-height: 1.6; color: #1f2937; background: #f8fafc; }
  @media (prefers-color-scheme: dark) { body { color: #e2e8f0; background: #0f172a; } .step { background: #1e293b !important; } table, pre, code { border-color: #334155 !important; } }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #64748b; font-size: 13px; margin-bottom: 16px; }
  .summary { display: flex; gap: 16px; flex-wrap: wrap; padding: 12px 16px; border-radius: 8px; background: rgba(148,163,184,0.12); margin-bottom: 20px; font-size: 13px; }
  .step { background: #fff; border: 1px solid rgba(148,163,184,0.25); border-left: 4px solid #94a3b8; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
  .step.success { border-left-color: #22c55e; }
  .step.failed { border-left-color: #ef4444; }
  .step h3 { margin: 0 0 6px; font-size: 14px; display: flex; align-items: center; gap: 8px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; display: inline-block; }
  .step.success .dot { background: #22c55e; }
  .step.failed .dot { background: #ef4444; }
  .meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #64748b; margin-bottom: 8px; align-items: center; }
  .badge { padding: 1px 8px; border-radius: 10px; font-weight: 600; color: #fff; background: #94a3b8; }
  .badge.success { background: #22c55e; }
  .badge.failed { background: #ef4444; }
  h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; margin: 12px 0 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 4px 0 8px; }
  th, td { border: 1px solid rgba(148,163,184,0.35); padding: 3px 8px; text-align: left; word-break: break-all; }
  th { background: rgba(148,163,184,0.12); }
  pre { background: rgba(148,163,184,0.12); padding: 8px; border-radius: 6px; font-size: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  code { font-family: 'SF Mono', Consolas, monospace; font-size: 12px; }
  .error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); color: #ef4444; padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; word-break: break-all; }
  ul { margin: 4px 0 8px; padding-left: 20px; font-size: 12px; }
  li.pass::marker { content: '✅ '; }
  li.fail::marker { content: '❌ '; }
</style>
</head>
<body>
<h1>${htmlEscape(report.title)}</h1>
<div class="subtitle">${htmlEscape(report.flowName)} · ${htmlEscape(report.trigger)} · 生成于 ${htmlEscape(report.generatedAtLabel)}</div>
<div class="summary">
  <span>结果：<strong>${htmlEscape(report.statusLabel)}</strong></span>
  <span>步骤：${report.summary.executed}/${report.summary.total}</span>
  <span>成功 ${report.summary.success}</span>
  <span>失败 ${report.summary.failed}</span>
  <span>跳过 ${report.summary.skipped}</span>
  <span>总耗时 ${htmlEscape(formatDuration(report.totalDurationMs))}</span>
</div>
${stepSections}
</body>
</html>`;
}

/**
 * 触发导出：主进程弹保存对话框，按所选扩展名写入对应格式。
 *
 * @returns {Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>}
 */
export async function exportRunReport({ flowName, run, unmask = false }) {
  if (typeof window === 'undefined' || !window.ipcRenderer) {
    return { success: false, error: '当前环境不支持文件导出' };
  }
  const report = buildReportData({ flowName, run, unmask });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const safeName = String(flowName || 'flow').replace(/[\\/:*?"<>|]/g, '_');
  try {
    return await window.ipcRenderer.invoke('flow-report:export', {
      defaultPath: `${safeName}-运行报告-${stamp}.html`,
      html: renderHtml(report),
      markdown: renderMarkdown(report)
    });
  } catch (err) {
    return { success: false, error: err?.message || '导出失败' };
  }
}
