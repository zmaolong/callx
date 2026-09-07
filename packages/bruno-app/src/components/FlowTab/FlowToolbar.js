import React from 'react';
import styled from 'styled-components';
import { IconPlayerPlay, IconPlayerStop, IconLayoutNavbar, IconAlertTriangle } from '@tabler/icons';

const FloatingToolbar = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: ${(props) => props.theme.background.crust};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.md};
  box-shadow: ${(props) => props.theme.shadow.sm};
`;

const ToolButton = styled.button`
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  border: 1px solid ${(props) => props.theme.button2.color.secondary.border};
  background: ${(props) => props.$variant === 'primary'
    ? props.theme.button2.color.primary.bg
    : props.$variant === 'danger'
      ? props.theme.button2.color.danger.bg
      : props.theme.button2.color.secondary.bg};
  color: ${(props) => props.$variant === 'primary'
    ? props.theme.button2.color.primary.text
    : props.$variant === 'danger'
      ? props.theme.button2.color.danger.text
      : props.theme.button2.color.secondary.text};
  cursor: pointer;
  font-size: 12px;
  font-weight: ${(props) => props.$variant === 'primary' ? 600 : 400};
  line-height: 1;
  white-space: nowrap;
  transition: all 0.15s ease;

  &:hover {
    opacity: 0.85;
    border-color: ${(props) => props.theme.border.border2};
  }
`;

const ErrorBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.status.danger.background};
  color: ${(props) => props.theme.status.danger.text};
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
`;

const FlowToolbar = ({
  onRun,
  onCancel,
  onAutoLayout,
  isRunning,
  errors
}) => {
  return (
    <FloatingToolbar>
      {!isRunning ? (
        <ToolButton $variant="primary" onClick={onRun} title="运行 Flow">
          <IconPlayerPlay size={14} />
          运行
        </ToolButton>
      ) : (
        <ToolButton $variant="danger" onClick={onCancel} title="取消运行">
          <IconPlayerStop size={14} />
          取消
        </ToolButton>
      )}

      <ToolButton onClick={onAutoLayout} title="自动布局">
        <IconLayoutNavbar size={14} />
        布局
      </ToolButton>

      {errors && errors.length > 0 && (
        <ErrorBadge>
          <IconAlertTriangle size={14} />
          {errors.length}
        </ErrorBadge>
      )}
    </FloatingToolbar>
  );
};

export default FlowToolbar;
