import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconPlayerTrackNext,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconLayoutNavbar,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand
} from '@tabler/icons';

const TopBarRoot = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px;
  flex-shrink: 0;
  background: ${(props) => props.theme.background.base};
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
`;

const RunGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const TitleGroup = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  overflow: hidden;
`;

const FlowName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ToolGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
`;

const Divider = styled.div`
  width: 1px;
  height: 18px;
  background: ${(props) => props.theme.border.border2};
  margin: 0 4px;
  flex-shrink: 0;
`;

const ToolButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
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

const IconButton = styled(ToolButton)`
  padding: 5px;
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
  right: 0;
  z-index: 30;
  width: 320px;
  max-height: 260px;
  overflow-y: auto;
  padding: 4px 0;
  background: ${(props) => props.theme.background.crust};
  border: 1px solid ${(props) => props.theme.border.border1};
  border-radius: ${(props) => props.theme.border.radius.md};
  box-shadow: ${(props) => props.theme.shadow.md || '0 4px 16px rgba(0, 0, 0, 0.3)'};
`;

const ErrorPopoverItem = styled.button`
  display: block;
  width: 100%;
  padding: 7px 12px;
  font-size: 12px;
  color: ${(props) => props.theme.text};
  cursor: pointer;
  line-height: 1.4;
  text-align: left;
  background: transparent;
  border: none;

  &:hover,
  &:focus-visible {
    background: ${(props) => props.theme.background.surface0};
    outline: none;
  }
`;

const ErrorItemNode = styled.span`
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 11px;
  margin-left: 6px;
`;

/**
 * Flow 顶部工具栏：运行控制（全局运行 + 单节点运行）、流程名称、
 * 撤销/重做/自动布局/保存/校验错误。
 */
const FlowTopBar = ({
  flowName,
  isRunning,
  onRun,
  onCancel,
  hasSelectedRequestNode,
  selectedNodeRunning,
  onRunNode,
  onRunUntilNode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onAutoLayout,
  onSave,
  errors,
  onFocusError,
  workbenchCollapsed,
  onToggleWorkbench
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
    <TopBarRoot>
      <RunGroup>
        {!isRunning ? (
          <ToolButton $variant="primary" onClick={onRun} title="运行整条 Flow">
            <IconPlayerPlay size={14} />
            运行
          </ToolButton>
        ) : (
          <ToolButton $variant="danger" onClick={onCancel} title="取消运行">
            <IconPlayerStop size={14} />
            取消
          </ToolButton>
        )}

        {hasSelectedRequestNode && (
          <>
            <Divider />
            <ToolButton
              onClick={onRunNode}
              disabled={isRunning || selectedNodeRunning}
              title="仅运行选中的节点（使用上游已缓存的响应）"
            >
              <IconPlayerPlay size={14} />
              单跑此节点
            </ToolButton>
            <ToolButton
              onClick={onRunUntilNode}
              disabled={isRunning}
              title="从 Start 执行到选中节点为止"
            >
              <IconPlayerTrackNext size={14} />
              运行到此
            </ToolButton>
          </>
        )}
      </RunGroup>

      <TitleGroup>
        <FlowName title={flowName}>{flowName}</FlowName>
      </TitleGroup>

      <ToolGroup>
        <IconButton onClick={onAutoLayout} title="自动布局">
          <IconLayoutNavbar size={15} />
        </IconButton>
        <IconButton onClick={onSave} title="保存 Flow（Ctrl+S）">
          <IconDeviceFloppy size={15} />
        </IconButton>
        <IconButton onClick={onUndo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
          <IconArrowBackUp size={15} />
        </IconButton>
        <IconButton onClick={onRedo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">
          <IconArrowForwardUp size={15} />
        </IconButton>
        <IconButton
          onClick={onToggleWorkbench}
          title={workbenchCollapsed ? '唤起工作台面板' : '隐藏工作台面板'}
          aria-label={workbenchCollapsed ? '唤起工作台面板' : '隐藏工作台面板'}
        >
          {workbenchCollapsed
            ? <IconLayoutSidebarRightExpand size={15} />
            : <IconLayoutSidebarRightCollapse size={15} />}
        </IconButton>

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
      </ToolGroup>
    </TopBarRoot>
  );
};

export default FlowTopBar;
