import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { IconPlayerPlay, IconPlayerStop, IconLayoutNavbar, IconAlertTriangle, IconArrowBackUp, IconArrowForwardUp, IconDeviceFloppy } from '@tabler/icons';

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
  cursor: ${(props) => props.disabled ? 'not-allowed' : 'pointer'};
  font-size: 12px;
  font-weight: ${(props) => props.$variant === 'primary' ? 600 : 400};
  line-height: 1;
  white-space: nowrap;
  transition: all 0.15s ease;
  opacity: ${(props) => props.disabled ? 0.4 : 1};

  &:hover {
    opacity: ${(props) => props.disabled ? 0.4 : 0.85};
    border-color: ${(props) => props.disabled ? 'inherit' : props.theme.border.border2};
  }
`;

const ErrorBadgeWrapper = styled.div`
  position: relative;
`;

const ErrorBadge = styled.button`
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 10px;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: ${(props) => props.theme.status.danger.background};
  color: ${(props) => props.theme.status.danger.text};
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;

  &:hover {
    opacity: 0.85;
  }
`;

const ErrorPopover = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  width: 320px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
  background: ${(props) => props.theme.background.crust};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.md};
  box-shadow: ${(props) => props.theme.shadow.md || '0 4px 16px rgba(0, 0, 0, 0.3)'};
`;

const ErrorPopoverItem = styled.div`
  padding: 7px 12px;
  font-size: 12px;
  color: ${(props) => props.theme.text};
  cursor: pointer;
  line-height: 1.4;

  &:hover {
    background: ${(props) => props.theme.background.surface0};
  }
`;

const ErrorItemNode = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 11px;
  margin-left: 6px;
`;

const FlowToolbar = ({
  onRun,
  onCancel,
  onAutoLayout,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isRunning,
  errors,
  onFocusError
}) => {
  const [errorPopoverOpen, setErrorPopoverOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (!errorPopoverOpen) return undefined;
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setErrorPopoverOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setErrorPopoverOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [errorPopoverOpen]);

  const hasErrors = errors && errors.length > 0;

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

      <ToolButton onClick={onSave} title="保存 Flow（Ctrl+S）">
        <IconDeviceFloppy size={14} />
        保存
      </ToolButton>

      <ToolButton onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
        <IconArrowBackUp size={14} />
        撤销
      </ToolButton>

      <ToolButton onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">
        <IconArrowForwardUp size={14} />
        重做
      </ToolButton>

      {hasErrors && (
        <ErrorBadgeWrapper ref={popoverRef}>
          <ErrorBadge
            onClick={() => setErrorPopoverOpen((open) => !open)}
            title="点击查看校验错误详情"
            aria-label={`校验错误 ${errors.length} 个，点击查看详情`}
          >
            <IconAlertTriangle size={14} />
            {errors.length}
          </ErrorBadge>
          {errorPopoverOpen && (
            <ErrorPopover>
              {errors.map((error, index) => (
                <ErrorPopoverItem
                  key={index}
                  onClick={() => {
                    setErrorPopoverOpen(false);
                    if (onFocusError) onFocusError(error);
                  }}
                  title="点击定位到相关节点"
                >
                  {error.message}
                  {error.nodeName && <ErrorItemNode>({error.nodeName})</ErrorItemNode>}
                </ErrorPopoverItem>
              ))}
            </ErrorPopover>
          )}
        </ErrorBadgeWrapper>
      )}
    </FloatingToolbar>
  );
};

export default FlowToolbar;
