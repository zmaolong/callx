import React from 'react';
import styled from 'styled-components';
import { IconPencil, IconCopy, IconTrash, IconSettings } from '@tabler/icons';

const SidebarContainer = styled.div`
  width: 280px;
  padding: 16px;
  background: ${(props) => props.theme.background.base};
  border-left: 1px solid ${(props) => props.theme.border.border1};
  overflow-y: auto;
`;

const SidebarEmpty = styled(SidebarContainer)`
  color: ${(props) => props.theme.colors.text.muted};
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: hidden;
`;

const SidebarTitle = styled.div`
  font-weight: 600;
  font-size: 14px;
  color: ${(props) => props.theme.text};
  margin-bottom: ${(props) => props.$large ? 12 : 8}px;
`;

const MutedText = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
`;

const InputLabel = styled.label`
  display: block;
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  margin-bottom: 4px;
`;

const SidebarInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.input.border};
  background: ${(props) => props.theme.input.bg || props.theme.background.surface0};
  color: ${(props) => props.theme.text};
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: ${(props) => props.theme.input.focusBorder};
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
`;

const ActionButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: none;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  background: ${(props) => props.$danger ? props.theme.button.danger.bg : props.theme.background.surface0};
  color: ${(props) => props.$danger ? props.theme.button.danger.color : props.theme.text};
  transition: background 0.15s ease;

  &:hover {
    background: ${(props) => props.$danger
      ? props.theme.button.danger.bg
      : props.theme.background.surface1};
  }
`;

const InputMappingItem = styled.div`
  padding: 6px 8px;
  margin-bottom: 4px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.background.surface0};
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
`;

const InputMappingName = styled.div`
  color: ${(props) => props.theme.text};
`;

const InputMappingSource = styled.div`
  font-size: 11px;
`;

const EmptyMappings = styled.div`
  font-size: 12px;
  color: ${(props) => props.theme.colors.text.muted};
  font-style: italic;
`;

const FlowSidebar = ({
  selectedNode,
  onUpdateNode,
  onEditRequest,
  onDeleteRequest,
  onDuplicateRequest
}) => {
  if (!selectedNode) {
    return (
      <SidebarEmpty>
        选择一个节点查看配置
      </SidebarEmpty>
    );
  }

  const nodeData = selectedNode.data || {};
  const nodeType = nodeData.type || selectedNode.type;

  if (nodeType === 'start' || nodeType === 'end') {
    return (
      <SidebarContainer>
        <SidebarTitle>
          {nodeType === 'start' ? 'Start 节点' : 'End 节点'}
        </SidebarTitle>
        <MutedText>
          此节点不可编辑
        </MutedText>
      </SidebarContainer>
    );
  }

  // Request 节点配置面板
  return (
    <SidebarContainer>
      <SidebarTitle $large>
        卡片配置
      </SidebarTitle>

      {/* Alias 编辑 */}
      <div style={{ marginBottom: 12 }}>
        <InputLabel>
          别名 (Alias)
        </InputLabel>
        <SidebarInput
          value={nodeData.alias || ''}
          onChange={(e) => onUpdateNode && onUpdateNode(selectedNode.id, { alias: e.target.value })}
          placeholder="输入别名"
        />
      </div>

      {/* 操作按钮 */}
      <ButtonGroup>
        <ActionButton onClick={() => onEditRequest && onEditRequest(nodeData)}>
          <IconPencil size={14} />
          编辑请求
        </ActionButton>
        <ActionButton onClick={() => onDuplicateRequest && onDuplicateRequest(nodeData)}>
          <IconCopy size={14} />
          复制请求
        </ActionButton>
        <ActionButton $danger onClick={() => onDeleteRequest && onDeleteRequest(nodeData)}>
          <IconTrash size={14} />
          删除请求
        </ActionButton>
      </ButtonGroup>

      {/* 输入映射列表 */}
      <div style={{ marginTop: 12 }}>
        <SidebarTitle style={{ fontSize: 13, marginBottom: 8 }}>
          输入映射
        </SidebarTitle>
        {(nodeData.inputs || []).length === 0 ? (
          <EmptyMappings>
            暂无输入映射
          </EmptyMappings>
        ) : (
          (nodeData.inputs || []).map((input, index) => (
            <InputMappingItem key={index}>
              <InputMappingName>{input.name}</InputMappingName>
              <InputMappingSource>
                {input.source?.kind === 'flow' ? input.source.expression : `字面量: ${input.source?.value}`}
              </InputMappingSource>
            </InputMappingItem>
          ))
        )}
      </div>
    </SidebarContainer>
  );
};

export default FlowSidebar;
