/**
 * ParallelChildNode — 并行组内子请求的微缩卡片（可点击选中，右侧面板显示配置）。
 *
 * 点击时通过 onSelectChild 回调通知父级选中该子节点，
 * 右侧面板会像普通请求节点一样展示别名、错误策略、输入映射等配置。
 */
import React from 'react';
import styled from 'styled-components';

const ChildCard = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 6px;
  background: ${(props) => props.theme.background?.surface1 || 'rgba(255,255,255,0.05)'};
  border: 1px solid ${(props) => props.$active ? (props.theme.colors?.accent || '#3b82f6') : (props.theme.border?.border1 || 'rgba(255,255,255,0.1)')};
  font-size: 12px;
  color: ${(props) => props.theme.text};
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${(props) => props.theme.colors?.accent || '#3b82f6'};
    background: ${(props) => props.theme.background?.surface2 || 'rgba(255,255,255,0.08)'};
  }
`;

const ChildMethodBadge = styled.span`
  font-size: 9px;
  font-weight: 700;
  line-height: 12px;
  padding: 0 3px;
  border-radius: 3px;
  color: ${(props) => props.$color};
  border: 1px solid ${(props) => props.$color};
  flex-shrink: 0;
`;

const ChildName = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-weight: 500;
`;

const ChildUrl = styled.span`
  font-size: 10px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
`;

const getMethodColor = (m) => {
  const colors = { GET: '#3b82f6', POST: '#22c55e', PUT: '#f59e0b', PATCH: '#a855f7', DELETE: '#ef4444', HEAD: '#64748b', OPTIONS: '#64748b' };
  return colors[m] || '#64748b';
};

const ParallelChildNode = ({ id, data, onClick, isActive, onContextMenu }) => {
  const method = String(data?.method || '').toUpperCase();
  const displayName = data?.alias || data?.label || id;

  return (
    <ChildCard
      $active={isActive}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick?.(id);
      }}
      onContextMenu={(e) => {
        onContextMenu?.(id, e);
      }}
      title={`点击配置「${displayName}」`}
    >
      {method && <ChildMethodBadge $color={getMethodColor(method)}>{method}</ChildMethodBadge>}
      <ChildName>{displayName}</ChildName>
      {data?.url && <ChildUrl title={data.url}>{data.url}</ChildUrl>}
    </ChildCard>
  );
};

export default ParallelChildNode;
