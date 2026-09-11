/**
 * FlowContextMenu — 画布右键菜单组件（浮层面板）。
 *
 * 根据点击的目标类型（节点/边/空白区域）展示不同的操作菜单。
 * 点击菜单项后自动关闭，点击外部或按 Escape 关闭。
 */
import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { IconPencil, IconCopy, IconTrash, IconPlus, IconSettings } from '@tabler/icons';

const MenuContainer = styled.div`
  position: fixed;
  z-index: 1000;
  min-width: 180px;
  padding: 4px 0;
  background: ${(props) => props.theme.background.crust};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  font-size: 13px;
`;

const MenuItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  color: ${(props) => (props.$danger ? '#ef4444' : props.theme.text)};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  &:hover {
    background: ${(props) => props.theme.background.surface0};
  }
`;

const MenuDivider = styled.div`
  height: 1px;
  margin: 4px 8px;
  background: ${(props) => props.theme.border.border1};
`;

const FlowContextMenu = ({ x, y, node, edge, onClose, onAction }) => {
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const nodeType = node?.data?.type || node?.type;
  const isRequestNode = node && nodeType === 'request';

  const emit = (type, extra) => {
    onAction?.(type, extra || node || edge);
    onClose();
  };

  return (
    <MenuContainer ref={ref} style={{ left: x, top: y }}>
      {/* 请求节点菜单 */}
      {isRequestNode && (
        <>
          <MenuItem onClick={() => emit('edit')}>
            <IconPencil size={14} /> 编辑请求
          </MenuItem>
          <MenuItem onClick={() => emit('duplicate')}>
            <IconCopy size={14} /> 复制请求
          </MenuItem>
          <MenuDivider />
          <MenuItem onClick={() => emit('addAfterNode')}>
            <IconPlus size={14} /> 添加后置节点
          </MenuItem>
          <MenuItem onClick={() => emit('configureCondition')}>
            <IconSettings size={14} /> 配置条件
          </MenuItem>
          <MenuDivider />
          <MenuItem $danger onClick={() => emit('deleteNode')}>
            <IconTrash size={14} /> 删除节点
          </MenuItem>
        </>
      )}

      {/* 开始节点菜单（只允许添加后置） */}
      {node && nodeType === 'start' && (
        <>
          <MenuItem onClick={() => emit('addAfterNode')}>
            <IconPlus size={14} /> 添加后置节点
          </MenuItem>
        </>
      )}

      {/* 边菜单 */}
      {edge && (
        <>
          <MenuItem onClick={() => emit('configureCondition')}>
            <IconSettings size={14} /> 配置条件
          </MenuItem>
          <MenuItem $danger onClick={() => emit('deleteEdge')}>
            <IconTrash size={14} /> 删除连线
          </MenuItem>
        </>
      )}

      {/* 空白区域菜单 */}
      {!node && !edge && (
        <MenuItem onClick={() => emit('addNodeAtPane', { paneX: x, paneY: y })}>
          <IconPlus size={14} /> 添加请求节点
        </MenuItem>
      )}
    </MenuContainer>
  );
};

export default FlowContextMenu;
