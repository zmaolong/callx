/**
 * FlowConditionModal — 边条件配置弹窗。
 *
 * 三种模式：
 * - 无条件（默认分支）：condition 置 null；
 * - 简单条件：{ field, operator, value }，field 为 flowContext 路径（如 step_x.status / step_x.body.code）；
 * - JS 表达式：{ expression }，运行时以 context 变量引用 flowContext。
 */
import React, { useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import Modal from 'components/Modal';
import FlowResponsePicker from './FlowResponsePicker';

const FormRow = styled.div`
  margin-bottom: 12px;
`;

const FieldLabel = styled.label`
  display: block;
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-bottom: 4px;
`;

const FieldInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input?.border || props.theme.border?.border1};
  background: ${(props) => props.theme.input?.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input?.focusBorder || props.theme.border?.border2};
  }
`;

const FieldSelect = styled(FieldInput)`
  cursor: pointer;
`;

const FieldTextarea = styled(FieldInput)`
  resize: vertical;
  min-height: 64px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
`;

const ModeTabs = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
`;

const ModeTab = styled.button`
  padding: 6px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  color: ${(props) => (props.$active ? props.theme.text : props.theme.colors?.text?.muted || '#94a3b8')};
  border-bottom: 2px solid ${(props) => (props.$active ? props.theme.text : 'transparent')};
  font-weight: ${(props) => (props.$active ? 600 : 400)};

  &:hover {
    color: ${(props) => props.theme.text};
  }
`;

const HintText = styled.div`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  line-height: 1.5;
  margin-top: 4px;

  code {
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
    background: ${(props) => props.theme.background?.surface0 || 'rgba(128,128,128,0.1)'};
    padding: 0 4px;
    border-radius: 3px;
  }
`;

const InlineButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
  border-radius: ${(props) => props.theme.border?.radius?.sm || 4}px;
  background: ${(props) => props.theme.background?.surface0 || 'transparent'};
  color: ${(props) => props.theme.text};
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: ${(props) => props.theme.background?.surface1 || 'rgba(128,128,128,0.15)'};
  }
`;

const InlineError = styled.div`
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
  font-size: 12px;
  margin-top: 8px;
`;

const FooterRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  gap: 8px;
`;

const FooterButton = styled.button`
  padding: 6px 16px;
  border-radius: ${(props) => props.theme.border?.radius?.sm || 4}px;
  border: 1px solid ${(props) => (props.$primary ? 'transparent' : props.theme.border?.border1 || '#e2e8f0')};
  background: ${(props) => {
    if (props.$primary) return props.theme.button?.primary?.bg || props.theme.colors?.accent || '#3b82f6';
    if (props.$dangerText) return 'transparent';
    return props.theme.background?.surface0 || 'transparent';
  }};
  color: ${(props) => {
    if (props.$primary) return props.theme.button?.primary?.color || '#fff';
    if (props.$dangerText) return props.theme.status?.danger?.text || '#ef4444';
    return props.theme.text;
  }};
  font-size: 13px;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
`;

const OPERATORS = [
  { value: 'eq', label: '等于 (==)' },
  { value: 'ne', label: '不等于 (!=)' },
  { value: 'gt', label: '大于 (>)' },
  { value: 'gte', label: '大于等于 (>=)' },
  { value: 'lt', label: '小于 (<)' },
  { value: 'lte', label: '小于等于 (<=)' },
  { value: 'contains', label: '包含' },
  { value: 'regex', label: '正则匹配' }
];

const detectMode = (condition) => {
  if (!condition) return 'none';
  if (condition.expression) return 'expression';
  return 'simple';
};

// 值类型自动转换：数字/布尔字面量转为对应类型，便于 gt/lt 等数值比较
const coerceValue = (raw) => {
  const text = String(raw ?? '').trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text !== '' && !Number.isNaN(Number(text))) return Number(text);
  return raw;
};

const FlowConditionModal = ({ edge, nodes, edges, flowRun, onSave, onClose }) => {
  const existing = edge?.data?.condition || edge?.condition || null;
  const [mode, setMode] = useState(detectMode(existing));
  const [field, setField] = useState(existing?.field || '');
  const [operator, setOperator] = useState(existing?.operator || 'eq');
  const [value, setValue] = useState(
    existing?.value === null || existing?.value === undefined ? '' : String(existing.value)
  );
  const [expression, setExpression] = useState(existing?.expression || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const expressionRef = useRef(null);

  const sourceNode = useMemo(
    () => nodes?.find((n) => n.id === edge?.source),
    [nodes, edge?.source]
  );
  const targetNode = useMemo(
    () => nodes?.find((n) => n.id === edge?.target),
    [nodes, edge?.target]
  );
  const nodeName = (node) => node?.alias || node?.id || '?';

  const handleSave = () => {
    if (mode === 'none') {
      onSave(null);
      return;
    }
    if (mode === 'simple') {
      if (!field.trim()) {
        setError('请填写字段路径，或通过「从响应选取」插入');
        return;
      }
      onSave({ field: field.trim(), operator, value: coerceValue(value) });
      return;
    }
    if (!expression.trim()) {
      setError('请填写 JS 表达式');
      return;
    }
    onSave({ expression: expression.trim() });
  };

  const insertIntoExpression = (snippet) => {
    const textarea = expressionRef.current;
    if (!textarea) {
      setExpression((prev) => prev + snippet);
      return;
    }
    const start = textarea.selectionStart ?? expression.length;
    const end = textarea.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + snippet + expression.slice(end);
    setExpression(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + snippet.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <>
      <Modal
        size="md"
        centered
        title={`配置条件：${nodeName(sourceNode)} → ${nodeName(targetNode)}`}
        handleCancel={onClose}
        hideFooter
      >
        <div style={{ padding: '4px 4px 8px' }}>
          <ModeTabs>
            <ModeTab
              $active={mode === 'none'}
              onClick={() => {
                setMode('none'); setError('');
              }}
            >
              无条件
            </ModeTab>
            <ModeTab
              $active={mode === 'simple'}
              onClick={() => {
                setMode('simple'); setError('');
              }}
            >
              简单条件
            </ModeTab>
            <ModeTab
              $active={mode === 'expression'}
              onClick={() => {
                setMode('expression'); setError('');
              }}
            >
              JS 表达式
            </ModeTab>
          </ModeTabs>

          {mode === 'none' && (
            <HintText>
              无条件边为<strong>默认分支</strong>：当同源节点的其他条件边都不满足时走这条边。
            </HintText>
          )}

          {mode === 'simple' && (
            <>
              <FormRow>
                <FieldLabel>字段路径（基于运行上下文，如 status、body.code）</FieldLabel>
                <div style={{ display: 'flex', gap: 6 }}>
                  <FieldInput
                    value={field}
                    onChange={(e) => {
                      setField(e.target.value); setError('');
                    }}
                    placeholder={`${edge?.source || 'step_x'}.status`}
                    style={{ flex: 1 }}
                  />
                  <InlineButton onClick={() => setPickerOpen(true)} title="从响应选取字段">
                    从响应选取
                  </InlineButton>
                </div>
                <HintText>
                  可引用源节点及其前驱的运行结果：<code>{`${edge?.source || 'step_x'}.status`}</code>（HTTP 状态码）、
                  <code>{`${edge?.source || 'step_x'}.body.字段`}</code>（响应体字段）
                </HintText>
              </FormRow>
              <FormRow>
                <FieldLabel>运算符</FieldLabel>
                <FieldSelect value={operator} onChange={(e) => setOperator(e.target.value)}>
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </FieldSelect>
              </FormRow>
              <FormRow>
                <FieldLabel>比较值</FieldLabel>
                <FieldInput
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value); setError('');
                  }}
                  placeholder="如 200、success"
                />
                <HintText>纯数字与 true/false 会自动按数值/布尔比较。</HintText>
              </FormRow>
            </>
          )}

          {mode === 'expression' && (
            <FormRow>
              <FieldLabel>JS 表达式（返回真值即走此边）</FieldLabel>
              <FieldTextarea
                ref={expressionRef}
                value={expression}
                onChange={(e) => {
                  setExpression(e.target.value); setError('');
                }}
                placeholder={`context.${edge?.source || 'step_x'}.status === 200`}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <HintText style={{ marginTop: 0 }}>
                  通过 <code>context</code> 访问运行上下文，如 <code>context.{edge?.source || 'step_x'}.body.code === 0</code>
                </HintText>
                <InlineButton onClick={() => setPickerOpen(true)} title="从响应选取字段">
                  从响应选取
                </InlineButton>
              </div>
            </FormRow>
          )}

          {error && (
            <InlineError role="alert">{error}</InlineError>
          )}

          <FooterRow>
            <div>
              {existing && (
                <FooterButton $dangerText onClick={() => onSave(null)} title="移除条件，恢复为默认分支">
                  清除条件
                </FooterButton>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <FooterButton onClick={onClose}>取消</FooterButton>
              <FooterButton $primary onClick={handleSave}>保存</FooterButton>
            </div>
          </FooterRow>
        </div>
      </Modal>

      {pickerOpen && (
        <FlowResponsePicker
          flowRun={flowRun}
          edges={edges}
          nodes={nodes}
          selectedNodeId={edge?.source}
          includeSelf
          title="选取条件字段"
          formatExpression={(stepId, path, rootPrefix = 'body') => (
            mode === 'expression'
              ? `context.${stepId}.${rootPrefix}${path ? `.${path}` : ''}`
              : `${stepId}.${rootPrefix}${path ? `.${path}` : ''}`
          )}
          onClose={() => setPickerOpen(false)}
          onInsertExpression={(text) => {
            if (mode === 'expression') {
              insertIntoExpression(text);
            } else {
              setField(text);
            }
            setError('');
          }}
        />
      )}
    </>
  );
};

export default FlowConditionModal;
