import React from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { getStatusColor, getMethodColor, STATUS_COLORS, STRATEGY_BADGE } from '../constants';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 2px solid ${(props) => props.$color};
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
  flex-shrink: 0;
`;

const NodeCard = styled.div`
  min-width: 180px;
  max-width: 260px;
  padding: 8px 12px;
  border-radius: 8px;
  background: ${(props) => props.theme.background?.surface0 || props.theme.background?.base || 'transparent'};
  border: 2px solid ${(props) => props.$statusColor};
  color: ${(props) => props.theme.text || 'inherit'};
  font-size: 13px;
  cursor: pointer;
  position: relative;
`;

const NodeHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => props.$color};
  flex-shrink: 0;
`;

const MethodBadge = styled.span`
  font-size: 10px;
  font-weight: 700;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 4px;
  color: ${(props) => props.$color};
  border: 1px solid ${(props) => props.$color};
  flex-shrink: 0;
`;

const NodeName = styled.span`
  font-weight: 600;
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NodeUrl = styled.div`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-top: 2px;
  padding-left: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NodeResult = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  padding-left: 14px;
  font-size: 10px;
`;

const ResultDuration = styled.span`
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
`;

const ResultHttpStatus = styled.span`
  color: ${(props) => (props.$ok ? STATUS_COLORS.success : STATUS_COLORS.failed)};
  font-weight: 600;
`;

// 失败时卡片底部的错误红条
const ErrorBar = styled.div`
  margin: 4px -12px -8px;
  padding: 3px 10px;
  border-radius: 0 0 6px 6px;
  background: ${(props) => props.theme.status?.danger?.background || 'rgba(239,68,68,0.12)'};
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
  font-size: 10px;
  line-height: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StrategyBadge = styled.span`
  position: absolute;
  right: 6px;
  bottom: ${(props) => (props.$lifted ? 22 : 4)}px;
  font-size: 9px;
  line-height: 12px;
  padding: 0 4px;
  border-radius: 6px;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color};
  white-space: nowrap;
`;

const NodeHandle = styled(Handle)`
  background: ${(props) => props.$color} !important;
  width: 10px !important;
  height: 10px !important;
  border: 2px solid #fff !important;
`;

/**
 * 请求节点卡片：状态指示 + 方法徽标 + 别名 + URL + 运行结果摘要。
 * 失败时底部显示错误红条，hover 显示响应摘要。
 */
const RequestNode = ({ data }) => {
  const theme = useTheme();
  const displayName = data.alias || data.label || data.url || 'Request';
  const status = data.executionStatus;
  const statusColor = getStatusColor(status, theme.colors?.text?.muted || '#64748b');
  const method = String(data.method || '').toUpperCase();
  const methodColor = getMethodColor(method);
  const strategy = data.errorHandler?.strategy;
  const hasErrorBar = status === 'failed' && data.errorMessage;

  // hover 摘要：状态 + 耗时 + HTTP 码 + 错误首行
  const summaryParts = [];
  if (data.duration !== undefined) summaryParts.push(`耗时 ${data.duration}ms`);
  if (data.httpStatus) summaryParts.push(`HTTP ${data.httpStatus}`);
  if (data.errorMessage) summaryParts.push(`错误：${String(data.errorMessage).split('\n')[0]}`);
  const summaryTitle = summaryParts.length > 0 ? `${displayName}\n${summaryParts.join('\n')}` : displayName;

  return (
    <NodeCard $statusColor={statusColor} title={summaryTitle}>
      <NodeHandle type="target" position={Position.Left} $color={statusColor} />

      <NodeHeader>
        {status === 'running' ? (
          <Spinner $color={statusColor} />
        ) : (
          <StatusDot $color={statusColor} />
        )}
        {method && <MethodBadge $color={methodColor}>{method}</MethodBadge>}
        <NodeName title={displayName}>{displayName}</NodeName>
      </NodeHeader>

      {data.url && data.alias && <NodeUrl title={data.url}>{data.url}</NodeUrl>}

      {(data.duration !== undefined || data.httpStatus) && (
        <NodeResult>
          {data.duration !== undefined && <ResultDuration>{data.duration}ms</ResultDuration>}
          {data.httpStatus && (
            <ResultHttpStatus $ok={data.httpStatus < 400}>HTTP {data.httpStatus}</ResultHttpStatus>
          )}
        </NodeResult>
      )}

      <StrategyBadge
        $lifted={hasErrorBar}
        $bg={STRATEGY_BADGE.continue.bg}
        $color={STRATEGY_BADGE.continue.color}
        style={{ display: strategy === 'continue' ? undefined : 'none' }}
      >
        失败继续
      </StrategyBadge>
      <StrategyBadge
        $lifted={hasErrorBar}
        $bg={STRATEGY_BADGE.jump.bg}
        $color={STRATEGY_BADGE.jump.color}
        style={{ display: strategy === 'jump' ? undefined : 'none' }}
      >
        失败跳转
      </StrategyBadge>

      {hasErrorBar && <ErrorBar>{String(data.errorMessage).split('\n')[0]}</ErrorBar>}

      <NodeHandle type="source" position={Position.Right} $color={statusColor} />
    </NodeCard>
  );
};

export default RequestNode;
