import React, { useMemo, useState } from 'react';
import styled from 'styled-components';
import { IconChevronRight, IconChevronDown, IconCode } from '@tabler/icons';
import { getPredecessorStepId } from 'utils/flow/graph';
import Modal from 'components/Modal';

const TreeContainer = styled.div`
  font-size: 12px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  max-height: 400px;
  overflow-y: auto;
`;

const TreeNode = styled.div`
  margin-left: ${(props) => (props.$depth > 0 ? 16 : 0)}px;
`;

const TreeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: ${(props) => (props.$clickable ? 'pointer' : 'default')};
  user-select: none;
  white-space: nowrap;

  &:hover {
    background: ${(props) => (props.$clickable ? 'rgba(59,130,246,0.1)' : 'transparent')};
  }
`;

const ToggleIcon = styled.span`
  display: inline-flex;
  align-items: center;
  width: 14px;
  flex-shrink: 0;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
`;

const KeyName = styled.span`
  color: ${(props) => props.theme.text};
  font-weight: 500;
  margin-right: 4px;
`;

const Colon = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-right: 4px;
`;

const ValueString = styled.span`
  color: #22c55e;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
`;

const ValueNumber = styled.span`
  color: #3b82f6;
`;

const ValueBool = styled.span`
  color: #a855f7;
`;

const ValueNull = styled.span`
  color: #94a3b8;
  font-style: italic;
`;

const ValueArray = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
`;

const ValueObject = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
`;

const InsertBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  margin-left: 8px;
  border: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
  border-radius: 3px;
  background: ${(props) => props.theme.background?.surface0 || '#f8fafc'};
  color: ${(props) => props.theme.text};
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
  opacity: 0.6;

  &:hover {
    opacity: 1;
    background: ${(props) => props.theme.background?.surface1 || '#f1f5f9'};
  }
`;

const StepGroup = styled.div`
  margin-bottom: 12px;
`;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  margin-bottom: 4px;
  border-bottom: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
`;

const StepLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const StepBadge = styled.span`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: ${(props) =>
    props.$status === 'success'
      ? 'rgba(34,197,94,0.15)'
      : props.$status === 'failed'
        ? 'rgba(239,68,68,0.15)'
        : 'rgba(148,163,184,0.15)'};
  color: ${(props) =>
    props.$status === 'success'
      ? '#22c55e'
      : props.$status === 'failed'
        ? '#ef4444'
        : '#94a3b8'};
  font-weight: 500;
`;

const EmptyText = styled.div`
  padding: 24px 0;
  text-align: center;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 13px;
  font-family: inherit;
`;

const PathPreview = styled.div`
  margin-top: 8px;
  padding: 6px 8px;
  background: ${(props) => props.theme.background?.surface0 || '#f8fafc'};
  border: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
  border-radius: 4px;
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  word-break: break-all;
`;

/**
 * 递归渲染 JSON 值树
 */
const JsonValueTree = ({ label, value, path, stepId, depth, onSelect }) => {
  const [expanded, setExpanded] = useState(depth < 2);

  if (value === null || value === undefined) {
    return (
      <TreeNode $depth={depth}>
        <TreeRow>
          {label !== null && (
            <>
              <KeyName>{label}</KeyName>
              <Colon>:</Colon>
            </>
          )}
          <ValueNull>null</ValueNull>
          {onSelect && (
            <InsertBtn onClick={() => onSelect(stepId, path)} title={`插入 {{$flow.${stepId}.body.${path}}}`}>
              <IconCode size={10} />
              插入
            </InsertBtn>
          )}
        </TreeRow>
      </TreeNode>
    );
  }

  if (Array.isArray(value)) {
    const isCollapsed = !expanded;
    return (
      <TreeNode $depth={depth}>
        <TreeRow $clickable onClick={() => setExpanded(!expanded)}>
          <ToggleIcon>{expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}</ToggleIcon>
          {label !== null && (
            <>
              <KeyName>{label}</KeyName>
              <Colon>:</Colon>
            </>
          )}
          <ValueArray>Array[{value.length}]</ValueArray>
          {onSelect && !isCollapsed && (
            <InsertBtn
              onClick={(e) => {
                e.stopPropagation(); onSelect(stepId, path);
              }}
              title={`插入 {{$flow.${stepId}.body.${path}}}`}
            >
              <IconCode size={10} />
              插入
            </InsertBtn>
          )}
        </TreeRow>
        {expanded
          && value.map((item, idx) => (
            <JsonValueTree
              key={idx}
              label={`[${idx}]`}
              value={item}
              path={path ? `${path}[${idx}]` : `[${idx}]`}
              stepId={stepId}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
      </TreeNode>
    );
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const isCollapsed = !expanded;
    return (
      <TreeNode $depth={depth}>
        <TreeRow $clickable onClick={() => setExpanded(!expanded)}>
          <ToggleIcon>{expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}</ToggleIcon>
          {label !== null && (
            <>
              <KeyName>{label}</KeyName>
              <Colon>:</Colon>
            </>
          )}
          <ValueObject>{`{${keys.length} 个字段}`}</ValueObject>
          {onSelect && !isCollapsed && (
            <InsertBtn
              onClick={(e) => {
                e.stopPropagation(); onSelect(stepId, path);
              }}
              title={`插入 {{$flow.${stepId}.body.${path}}}`}
            >
              <IconCode size={10} />
              插入
            </InsertBtn>
          )}
        </TreeRow>
        {expanded
          && keys.map((key) => (
            <JsonValueTree
              key={key}
              label={key}
              value={value[key]}
              path={path ? `${path}.${key}` : key}
              stepId={stepId}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
      </TreeNode>
    );
  }

  // Leaf values
  const displayValue = typeof value === 'string' ? `"${value}"` : String(value);
  const ValueTag
    = typeof value === 'number'
      ? ValueNumber
      : typeof value === 'boolean'
        ? ValueBool
        : ValueString;

  return (
    <TreeNode $depth={depth}>
      <TreeRow>
        {label !== null && (
          <>
            <KeyName>{label}</KeyName>
            <Colon>:</Colon>
          </>
        )}
        <ValueTag>{displayValue}</ValueTag>
        {onSelect && (
          <InsertBtn onClick={() => onSelect(stepId, path)} title={`插入 {{$flow.${stepId}.body.${path}}}`}>
            <IconCode size={10} />
            插入
          </InsertBtn>
        )}
      </TreeRow>
    </TreeNode>
  );
};

/**
 * 响应字段选取器
 *
 * 根据当前选中的节点，列出所有前驱节点的响应数据，
 * 用户可点击字段插入对应的 `{{$flow.<stepId>.body.<path>}}` 表达式。
 *
 * @param {Function} formatExpression 可选，自定义表达式格式 (stepId, path) => string，
 *                                    默认生成输入映射格式；条件配置传入字段路径格式。
 * @param {string} title 可选，弹窗标题。
 */
const FlowResponsePicker = ({ flowRun, edges, selectedNodeId, onClose, onInsertExpression, nodes, formatExpression, title, includeSelf }) => {
  // 收集所有有响应数据的前驱节点
  const predecessorSteps = useMemo(() => {
    if (!flowRun?.nodes || !edges || !selectedNodeId) return [];

    const result = [];
    const visited = new Set();
    let currentId = selectedNodeId;

    // 条件场景：包含起始节点自身（边条件引用源节点的响应）
    if (includeSelf) {
      const selfState = flowRun.nodes[selectedNodeId];
      if (selfState && (selfState.status === 'success' || selfState.status === 'failed')) {
        const selfNode = nodes?.find((n) => n.id === selectedNodeId);
        result.push({
          stepId: selectedNodeId,
          label: selfNode?.alias || selectedNodeId,
          status: selfState.status,
          body: selfState.body
        });
      }
      visited.add(selectedNodeId);
    }

    // 沿入边向上回溯
    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const predecessorId = getPredecessorStepId(currentId, edges);
      if (!predecessorId || predecessorId === 'start') break;

      const nodeState = flowRun.nodes[predecessorId];
      if (nodeState && (nodeState.status === 'success' || nodeState.status === 'failed')) {
        const node = nodes?.find((n) => n.id === predecessorId);
        result.push({
          stepId: predecessorId,
          label: node?.alias || predecessorId,
          status: nodeState.status,
          body: nodeState.body
        });
      }

      currentId = predecessorId;
    }

    return result;
  }, [flowRun, edges, selectedNodeId, nodes, includeSelf]);

  const handleSelect = (stepId, path) => {
    const expression = formatExpression
      ? formatExpression(stepId, path)
      : `{{$flow.${stepId}.body.${path}}}`;
    onInsertExpression?.(expression);
    onClose?.();
  };

  return (
    <Modal
      size="md"
      centered
      title={title || '从响应选取字段'}
      handleCancel={onClose}
      hideFooter
      noPadding
    >
      <div style={{ padding: '8px 16px 16px' }}>
        {predecessorSteps.length === 0 ? (
          <EmptyText>
            当前节点没有已完成的前驱节点
            <br />
            <span style={{ fontSize: 11 }}>
              请先运行 Flow，或确保当前节点前有已执行的请求节点
            </span>
          </EmptyText>
        ) : (
          <>
            <PathPreview>
              点击「插入」按钮可将表达式填入映射变量的来源输入框
            </PathPreview>
            <TreeContainer>
              {predecessorSteps.map((step) => (
                <StepGroup key={step.stepId}>
                  <StepHeader>
                    <StepLabel>{step.label}</StepLabel>
                    <StepBadge $status={step.status}>
                      {step.status === 'success' ? '成功' : '失败'}
                    </StepBadge>
                  </StepHeader>
                  {step.body !== null && step.body !== undefined ? (
                    <JsonValueTree
                      label={null}
                      value={step.body}
                      path=""
                      stepId={step.stepId}
                      depth={0}
                      onSelect={handleSelect}
                    />
                  ) : (
                    <EmptyText style={{ padding: 8, textAlign: 'left', fontSize: 11 }}>
                      该节点无响应体数据
                    </EmptyText>
                  )}
                </StepGroup>
              ))}
            </TreeContainer>
          </>
        )}
      </div>
    </Modal>
  );
};

export default FlowResponsePicker;
