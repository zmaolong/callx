import React, { useState, useMemo } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  IconChevronUp,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconCircleOff,
  IconRefresh,
  IconPlayerPlay,
  IconPlayerStop
} from '@tabler/icons';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const PanelContainer = styled.div`
  border-top: 1px solid ${(props) => props.theme.border.border1};
  background: ${(props) => props.theme.background.base};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
  border-bottom: ${(props) => (props.$expanded ? `1px solid ${props.theme.border.border1}` : 'none')};
  background: ${(props) => props.theme.background.surface0};

  &:hover {
    opacity: 0.85;
  }
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color};
`;

const StepCount = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-weight: 400;
`;

const TotalDuration = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  font-weight: 400;
  margin-left: auto;
  margin-right: 12px;
`;

const StepList = styled.div`
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
`;

const StepRow = styled.div`
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${(props) => props.theme.background.surface0};
  }
`;

const StepHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  font-size: 13px;
  color: ${(props) => props.theme.text};
`;

const StepName = styled.span`
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StepDuration = styled.span`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  min-width: 50px;
  text-align: right;
`;

const StepStatus = styled.span`
  font-size: 11px;
  font-weight: 600;
  min-width: 60px;
  text-align: right;
  color: ${(props) => props.$color};
`;

const SpinningIcon = styled(IconRefresh)`
  animation: ${spin} 1s linear infinite;
`;

const StepDetail = styled.div`
  padding: 0 16px 12px 42px;
  font-size: 12px;
`;

const DetailSection = styled.div`
  margin-bottom: 8px;
`;

const DetailTitle = styled.div`
  font-weight: 600;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-bottom: 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  td {
    padding: 3px 8px;
    border: 1px solid ${(props) => props.theme.border.border1};
    vertical-align: top;
  }

  td:first-child {
    width: 120px;
    font-weight: 600;
    color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
    background: ${(props) => props.theme.background.surface0};
  }

  td:last-child {
    color: ${(props) => props.theme.text};
    word-break: break-all;
    font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  }
`;

const JsonBlock = styled.pre`
  margin: 0;
  padding: 8px;
  background: ${(props) => props.theme.background.surface0};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 200px;
  overflow: auto;
  color: ${(props) => props.theme.text};
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
`;

const ErrorText = styled.div`
  padding: 6px 8px;
  background: ${(props) => props.theme.status.danger?.background || 'rgba(239,68,68,0.1)'};
  border: 1px solid ${(props) => props.theme.status.danger?.text || '#ef4444'};
  border-radius: 4px;
  color: ${(props) => props.theme.status.danger?.text || '#ef4444'};
  font-size: 12px;
  line-height: 1.4;
`;

const EmptyPanel = styled.div`
  padding: 20px 16px;
  text-align: center;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 13px;
`;

/**
 * 底部抽屉结果面板
 *
 * 展示 Flow 运行的步骤列表、状态、输入变量、响应详情。
 */
const FlowRunPanel = ({ flowRun, nodes, isRunning }) => {
  const [expanded, setExpanded] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState(new Set());

  // 运行中或刚完成时自动展开
  const hasRunData = flowRun && Object.keys(flowRun.nodes || {}).length > 0;
  const isFlowRunning = flowRun?.status === 'running';

  const togglePanel = () => setExpanded((prev) => !prev);

  const toggleStep = (stepId) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  // 获取节点显示名称
  const getNodeName = (stepId) => {
    if (!nodes) return stepId;
    const node = nodes.find((n) => n.id === stepId);
    if (!node) return stepId;
    return node.alias || node.id;
  };

  // 计算总耗时
  const totalDuration = useMemo(() => {
    if (!flowRun?.nodes) return null;
    let total = 0;
    for (const state of Object.values(flowRun.nodes)) {
      if (state.duration) total += state.duration;
    }
    return total;
  }, [flowRun?.nodes]);

  // 获取状态图标和颜色
  const getStatusInfo = (status) => {
    switch (status) {
      case 'running':
        return { icon: SpinningIcon, color: '#3b82f6', label: '运行中' };
      case 'success':
        return { icon: IconCircleCheck, color: '#22c55e', label: '成功' };
      case 'failed':
        return { icon: IconCircleX, color: '#ef4444', label: '失败' };
      case 'cancelled':
        return { icon: IconCircleOff, color: '#f59e0b', label: '已取消' };
      case 'skipped':
        return { icon: IconCircleOff, color: '#94a3b8', label: '已跳过' };
      default:
        return { icon: null, color: '#64748b', label: '等待中' };
    }
  };

  // 格式化 JSON
  const formatJson = (data) => {
    if (data === null || data === undefined) return 'null';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  // 获取 Flow 整体状态信息
  const getFlowStatusInfo = () => {
    if (isFlowRunning) {
      return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: '运行中' };
    }
    if (flowRun?.status === 'success') {
      return { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', label: '成功' };
    }
    if (flowRun?.status === 'failed') {
      return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '失败' };
    }
    if (flowRun?.status === 'cancelled') {
      return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: '已取消' };
    }
    return null;
  };

  // 计算步骤数
  const stepEntries = useMemo(() => {
    if (!flowRun?.nodes) return [];
    return Object.entries(flowRun.nodes).filter(
      ([stepId]) => stepId !== 'start' && stepId !== 'end'
    );
  }, [flowRun?.nodes]);

  if (!hasRunData && !isRunning) {
    return null;
  }

  const flowStatusInfo = getFlowStatusInfo();

  return (
    <PanelContainer>
      <PanelHeader $expanded={expanded} onClick={togglePanel}>
        <HeaderLeft>
          {expanded ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          <span>运行结果</span>
          {flowStatusInfo && (
            <StatusBadge $bg={flowStatusInfo.bg} $color={flowStatusInfo.color}>
              {isFlowRunning && <IconRefresh size={12} style={{ animation: `${spin} 1s linear infinite` }} />}
              {flowStatusInfo.label}
            </StatusBadge>
          )}
          <StepCount>
            {stepEntries.filter(([, s]) => s.status !== 'idle').length}/{stepEntries.length} 步
          </StepCount>
        </HeaderLeft>
        {totalDuration !== null && <TotalDuration>总耗时 {totalDuration}ms</TotalDuration>}
      </PanelHeader>

      {expanded && (
        <>
          {stepEntries.length === 0 ? (
            <EmptyPanel>暂无步骤数据</EmptyPanel>
          ) : (
            <StepList>
              {stepEntries.map(([stepId, state]) => {
                const { icon: StatusIcon, color: statusColor, label: statusLabel } = getStatusInfo(state.status);
                const isExpanded = expandedSteps.has(stepId);
                const isRunningStep = state.status === 'running';

                return (
                  <StepRow key={stepId} onClick={() => toggleStep(stepId)}>
                    <StepHeader>
                      {StatusIcon ? (
                        isRunningStep ? (
                          <SpinningIcon size={18} strokeWidth={1.5} color={statusColor} />
                        ) : (
                          <StatusIcon size={18} strokeWidth={1.5} color={statusColor} />
                        )
                      ) : (
                        <IconCircleOff size={18} strokeWidth={1.5} color={statusColor} />
                      )}
                      <StepName>{getNodeName(stepId)}</StepName>
                      {state.duration !== null && (
                        <StepDuration>{state.duration}ms</StepDuration>
                      )}
                      <StepStatus $color={statusColor}>{statusLabel}</StepStatus>
                    </StepHeader>

                    {isExpanded && (
                      <StepDetail>
                        {/* 输入变量 */}
                        {state.inputVariables && Object.keys(state.inputVariables).length > 0 && (
                          <DetailSection>
                            <DetailTitle>输入变量</DetailTitle>
                            <DetailTable>
                              <tbody>
                                {Object.entries(state.inputVariables).map(([key, value]) => (
                                  <tr key={key}>
                                    <td>{key}</td>
                                    <td>{formatJson(value)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </DetailTable>
                          </DetailSection>
                        )}

                        {/* 错误信息 */}
                        {state.error && (
                          <DetailSection>
                            <DetailTitle>错误</DetailTitle>
                            <ErrorText>{state.error}</ErrorText>
                          </DetailSection>
                        )}

                        {/* 响应体 */}
                        {state.body !== null && state.body !== undefined && (
                          <DetailSection>
                            <DetailTitle>响应体</DetailTitle>
                            <JsonBlock>{formatJson(state.body)}</JsonBlock>
                          </DetailSection>
                        )}
                      </StepDetail>
                    )}
                  </StepRow>
                );
              })}
            </StepList>
          )}
        </>
      )}
    </PanelContainer>
  );
};

export default FlowRunPanel;
