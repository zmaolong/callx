import React from 'react';
import styled from 'styled-components';
import Modal from 'components/Modal';
import { getMethodColor } from './constants';

const TargetList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
`;

const TargetButton = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid ${(props) => props.theme.border?.border1 || '#e2e8f0'};
  border-radius: 6px;
  background: ${(props) => props.theme.background?.surface0 || 'transparent'};
  color: ${(props) => props.theme.text};
  cursor: pointer;
  text-align: left;
  font-size: 13px;

  &:hover {
    background: ${(props) => props.theme.background?.surface1 || 'rgba(128,128,128,0.1)'};
  }
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

const TargetName = styled.span`
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const TargetUrl = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/**
 * 快速映射目标选择：源节点有多个下游请求节点时，选择要映射到哪个下游。
 */
const QuickMapTargetModal = ({ sourceName, targets, onSelect, onClose }) => {
  return (
    <Modal
      size="md"
      centered
      title={`映射到下游：${sourceName || ''}`}
      handleCancel={onClose}
      hideFooter
    >
      <div style={{ padding: '4px 4px 8px' }}>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 10px' }}>
          该节点有多个下游请求节点，请选择要把当前响应映射到哪个节点（选择后自动创建输入映射，可在工作台调整）
        </p>
        <TargetList>
          {targets.map((edge) => (
            <TargetButton key={edge.id} onClick={() => onSelect(edge)}>
              <MethodBadge $color={getMethodColor(edge.method)}>{edge.method || 'GET'}</MethodBadge>
              <TargetName>{edge.label}</TargetName>
              <TargetUrl>{edge.url}</TargetUrl>
            </TargetButton>
          ))}
        </TargetList>
      </div>
    </Modal>
  );
};

export default QuickMapTargetModal;
