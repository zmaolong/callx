/**
 * ParallelNode — 并行组节点卡片。
 *
 * 嵌套容器模式 + 折叠/展开。
 * - 展开态：显示内部子请求节点（parentId = 本节点 id 的 request 节点）
 * - 折叠态：隐藏子请求，显示摘要文案
 * - handle：左进右出各一对
 * - 子请求可点击选中，右侧面板显示配置
 */
import React, { useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { IconGripHorizontal, IconChevronDown, IconChevronRight } from '@tabler/icons';
import { getStatusColor } from '../constants';
import ParallelChildNode from './ParallelChildNode';

const GroupCard = styled.div`
  min-width: 200px;
  min-height: ${(props) => (props.$collapsed ? 'auto' : '120px')};
  border-radius: 10px;
  background: ${(props) => props.theme.background?.surface0 || props.theme.background?.base || 'transparent'};
  border: 2px solid ${(props) => props.$statusColor};
  border-style: dashed;
  color: ${(props) => props.theme.text || 'inherit'};
  font-size: 13px;
  cursor: pointer;
  position: relative;
  transition: min-height 0.2s ease;
`;

const CollapseButton = styled.button`
  position: absolute;
  top: 2px;
  left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  cursor: pointer;
  z-index: 5;

  &:hover {
    background: ${(props) => props.theme.background?.surface1 || 'rgba(255,255,255,0.1)'};
  }
`;

const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  padding-left: 28px;
`;

const StatusDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(props) => props.$color};
  flex-shrink: 0;
`;

const ParallelIcon = styled(IconGripHorizontal)`
  flex-shrink: 0;
  color: ${(props) => props.$color};
`;

const GroupName = styled.span`
  font-weight: 600;
  font-size: 13px;
  line-height: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const GroupSummary = styled.span`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  margin-left: auto;
  white-space: nowrap;
`;

const ChildrenContainer = styled.div`
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: auto;
`;

const ChildBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: ${(props) => props.theme.background?.surface1 || 'rgba(255,255,255,0.05)'};
  border: 1px solid ${(props) => props.theme.border?.border1 || 'rgba(255,255,255,0.1)'};
  font-size: 11px;
  color: ${(props) => props.theme.text};
  position: relative;
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
`;

const ChildUrl = styled.span`
  font-size: 10px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
`;

const NodeHandle = styled(Handle)`
  background: ${(props) => props.$color} !important;
  width: 10px !important;
  height: 10px !important;
  border: 2px solid #fff !important;
`;

const CollapsedChildrenCount = styled.span`
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

/**
 * 从全局 React Flow nodes 中查找属于本组的子节点。
 * 由于 data.children 可能未及时更新，尝试从 context 取；若不可用则直接使用 data.children。
 */
const ParallelNode = ({ data, children: rfChildren }) => {
  const status = data.executionStatus;
  const statusColor = getStatusColor(status);
  const displayName = data.alias || data.label || '并行组';
  const collapsed = data.collapsed;
  const childNodes = data.children || [];

  // 摘要文案
  const summaryParts = [`${childNodes.length} 个子请求`];

  return (
    <GroupCard $statusColor={statusColor} $collapsed={collapsed}>
      <NodeHandle type="target" position={Position.Left} $color={statusColor} />

      {collapsed && childNodes.length > 0 && (
        <CollapsedChildrenCount $color={statusColor} title={`${childNodes.length} 个子请求`}>
          {childNodes.length}
        </CollapsedChildrenCount>
      )}

      <CollapseButton
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // data.onToggleCollapse 由外部注入，用于更新画布节点的 `collapsed` 状态
          data.onToggleCollapse?.();
        }}
        title={collapsed ? '展开并行组' : '折叠并行组'}
        aria-label={collapsed ? '展开并行组' : '折叠并行组'}
      >
        {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
      </CollapseButton>

      <GroupHeader>
        <StatusDot $color={statusColor} />
        <ParallelIcon size={14} $color={statusColor} />
        <GroupName title={displayName}>{displayName}</GroupName>
        <GroupSummary>{summaryParts.join(' · ')}</GroupSummary>
      </GroupHeader>

      {!collapsed && childNodes.length > 0 && (
        <ChildrenContainer>
          {childNodes.map((child) => (
            <ParallelChildNode
              key={child.id}
              id={child.id}
              data={child.data}
              isActive={data.selectedChildId === child.id}
              onClick={(childId) => {
                data.onSelectChild?.(childId);
              }}
              onContextMenu={(childId, event) => {
                data.onChildContextMenu?.(childId, event);
              }}
            />
          ))}
        </ChildrenContainer>
      )}

      {!collapsed && childNodes.length === 0 && (
        <ChildrenContainer>
          <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', padding: '4px 0', textAlign: 'center' }}>
            拖拽请求节点到此处
          </div>
        </ChildrenContainer>
      )}

      <NodeHandle type="source" position={Position.Right} $color={statusColor} />
    </GroupCard>
  );
};

export default ParallelNode;
