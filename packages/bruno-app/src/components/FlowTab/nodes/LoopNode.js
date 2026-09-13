/**
 * LoopNode — 循环节点卡片。
 *
 * 展示：状态指示 + 循环图标 + 别名 + 数据源摘要 + 迭代进度徽标（低干扰，无闪烁动效）。
 * 体段节点保留最后一轮终态；进度由 flowRun 节点态的 loopProgress 驱动。
 */
import React from 'react';
import styled from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { IconRepeat } from '@tabler/icons';
import { getStatusColor } from '../constants';
import { summarizeLoopSource } from 'utils/flow/graph';

const NodeCard = styled.div`
  min-width: 180px;
  max-width: 260px;
  padding: 8px 12px;
  border-radius: 8px;
  background: ${(props) => props.theme.background?.surface0 || props.theme.background?.base || 'transparent'};
  border: 2px solid ${(props) => props.$statusColor};
  border-style: dashed;
  color: ${(props) => props.theme.text || 'inherit'};
  font-size: 13px;
  cursor: pointer;
  position: relative;
`;

const ProgressBadge = styled.span`
  position: absolute;
  top: -9px;
  right: -9px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  background: ${(props) => props.theme.background?.crust || '#1e1e1e'};
  border: 1px solid ${(props) => props.$color};
  color: ${(props) => props.$color};
  z-index: 5;
  box-shadow: ${(props) => props.theme.shadow?.sm || '0 1px 4px rgba(0,0,0,0.3)'};
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

const LoopIcon = styled(IconRepeat)`
  flex-shrink: 0;
  color: ${(props) => props.$color};
`;

const NodeName = styled.span`
  font-weight: 600;
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NodeSource = styled.div`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-top: 2px;
  padding-left: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const NodeHandle = styled(Handle)`
  background: ${(props) => props.$color} !important;
  width: 10px !important;
  height: 10px !important;
  border: 2px solid #fff !important;
`;

const LoopNode = ({ data }) => {
  const status = data.executionStatus;
  const statusColor = getStatusColor(status);
  const displayName = data.alias || data.label || '循环';
  const sourceSummary = summarizeLoopSource(data.loopConfig);
  const progress = data.loopProgress;

  const summaryParts = [sourceSummary];
  if (progress?.collectedCount > 0) {
    summaryParts.push(`已收集 ${progress.collectedCount} 项`);
  }
  const summaryTitle = `${displayName}\n${summaryParts.join('\n')}`;

  return (
    <NodeCard $statusColor={statusColor} title={summaryTitle}>
      <NodeHandle type="target" position={Position.Left} $color={statusColor} />

      {progress && (
        <ProgressBadge $color={statusColor} title={`迭代进度 ${progress.current}/${progress.total}`}>
          {progress.current}/{progress.total}
        </ProgressBadge>
      )}

      <NodeHeader>
        <StatusDot $color={statusColor} />
        <LoopIcon size={14} $color={statusColor} />
        <NodeName title={displayName}>{displayName}</NodeName>
      </NodeHeader>

      <NodeSource title={sourceSummary}>{sourceSummary}</NodeSource>

      <NodeHandle type="source" position={Position.Right} $color={statusColor} />
    </NodeCard>
  );
};

export default LoopNode;
