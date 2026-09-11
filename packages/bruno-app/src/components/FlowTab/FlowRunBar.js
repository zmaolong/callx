import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import {
  IconChevronUp,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconCircleOff,
  IconRefresh,
  IconMaximize,
  IconMinimize
} from '@tabler/icons';
import {
  getStatusColor,
  STATUS_COLORS,
  STATUS_BADGE_BG,
  RUN_BAR_HEIGHT,
  RUN_BAR_DEFAULT_EXPANDED_RATIO,
  RUN_BAR_MIN_EXPANDED_HEIGHT,
  RUN_BAR_COLLAPSED_STORAGE_KEY,
  RUN_BAR_EXPANDED_HEIGHT_STORAGE_KEY
} from './constants';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const BarRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-top: 1px solid ${(props) => props.theme.border.border1};
  background: ${(props) => props.theme.background.base};
`;

const ResizeHandle = styled.div`
  height: 4px;
  cursor: row-resize;
  flex-shrink: 0;
  background: transparent;
  transition: background 0.15s ease;

  &:hover,
  &:active {
    background: ${(props) => props.theme.colors?.accent || '#3b82f6'};
  }
`;

const BarHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  height: ${RUN_BAR_HEIGHT}px;
  padding: 0 12px;
  cursor: pointer;
  user-select: none;
  background: ${(props) => props.theme.background.surface0};

  &:hover {
    opacity: 0.9;
  }
`;

const StatusBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color};
  white-space: nowrap;
`;

const MetaText = styled.span`
  font-size: 12px;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  white-space: nowrap;
`;

const FailureSummary = styled.span`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: ${(props) => props.theme.status?.danger?.text || '#ef4444'};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Spacer = styled.div`
  flex: 1;
  min-width: 0;
`;

const BarActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: ${(props) => props.theme.border.radius.sm};
  background: transparent;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  cursor: pointer;

  &:hover {
    background: ${(props) => props.theme.background.surface1};
    color: ${(props) => props.theme.text};
  }
`;

const StepList = styled.div`
  overflow-y: auto;
  padding: 4px 0;
  background: ${(props) => props.theme.background.base};
`;

const StepRow = styled.button`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 16px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: ${(props) => props.theme.text};
  text-align: left;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${(props) => props.theme.background.surface0};
  }

  ${(props) => props.$active && `
    background: ${props.theme.background.surface1};
    border-left-color: ${props.theme.colors?.accent || '#3b82f6'};
  `}

  ${(props) => props.$failed && `
    border-left-color: ${props.theme.status?.danger?.text || '#ef4444'};
  `}
`;

const StepName = styled.span`
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StepDuration = styled.span`
  font-size: 11px;
  color: ${(props) => props.theme.colors?.text?.subtext0 || '#64748b'};
  min-width: 50px;
  text-align: right;
`;

const StepStatus = styled.span`
  font-size: 11px;
  font-weight: 600;
  min-width: 60px;
  text-align: right;
  color: ${(props) => props.$color};
`;

const SpinningIcon = styled(IconRefresh)`
  animation: ${spin} 1s linear infinite;
`;

const EmptyPanel = styled.div`
  padding: 16px;
  text-align: center;
  color: ${(props) => props.theme.colors?.text?.muted || '#94a3b8'};
  font-size: 13px;
`;

// 全屏总览浮层：absolute 相对 Flow Tab 根容器，避免盖住软件标题栏按钮
const FullscreenOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: ${(props) => props.theme.background.base};
`;

const FullscreenHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid ${(props) => props.theme.border.border1};
  background: ${(props) => props.theme.background.surface0};
  font-size: 14px;
  font-weight: 600;
  color: ${(props) => props.theme.text};
`;

const FullscreenBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
`;

/**
 * 底部全局运行条。
 *
 * 收起时为一行摘要（状态 + 进度 + 耗时 + 失败摘要），
 * 展开后为步骤总览列表（点击步骤定位画布节点），支持全屏查看。
 */
const FlowRunBar = ({ flowRun, nodes, edges, isRunning, selectedNodeId, onSelectStep }) => {
  const [expanded, setExpanded] = useState(
    () => window.localStorage?.getItem(RUN_BAR_COLLAPSED_STORAGE_KEY) !== '1'
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(() => {
    const stored = Number(window.localStorage?.getItem(RUN_BAR_EXPANDED_HEIGHT_STORAGE_KEY));
    return stored >= RUN_BAR_MIN_EXPANDED_HEIGHT
      ? stored
      : Math.round(window.innerHeight * RUN_BAR_DEFAULT_EXPANDED_RATIO);
  });

  const stepListRef = useRef(null);
  const dragStateRef = useRef(null);

  const isFlowRunning = flowRun?.status === 'running';

  // 运行中自动展开
  useEffect(() => {
    if (isFlowRunning || isRunning) {
      setExpanded(true);
    }
  }, [isFlowRunning, isRunning]);

  // 运行失败时自动展开并滚动到第一个失败步骤
  const prevStatusRef = useRef(null);
  useEffect(() => {
    const status = flowRun?.status;
    if (status === 'failed' && prevStatusRef.current === 'running') {
      setExpanded(true);
      // 等待列表渲染后滚动到失败步骤
      setTimeout(() => {
        const failedRow = stepListRef.current?.querySelector('[data-failed="true"]');
        failedRow?.scrollIntoView({ block: 'center' });
      }, 50);
    }
    prevStatusRef.current = status;
  }, [flowRun?.status]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => {
      window.localStorage?.setItem(RUN_BAR_COLLAPSED_STORAGE_KEY, prev ? '1' : '0');
      return !prev;
    });
  }, []);

  // 拖拽调整展开高度（拖拽期间直接写 DOM，避免逐帧 React 渲染）
  const handleResizeStart = useCallback((event) => {
    event.preventDefault();
    dragStateRef.current = { startY: event.clientY, startHeight: expandedHeight };
  }, [expandedHeight]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const state = dragStateRef.current;
      if (!state) return;
      const delta = state.startY - e.clientY;
      const maxHeight = Math.round(window.innerHeight * 0.8);
      const next = Math.min(maxHeight, Math.max(RUN_BAR_MIN_EXPANDED_HEIGHT, state.startHeight + delta));
      const listEl = stepListRef.current?.parentElement;
      if (listEl) {
        listEl.style.height = `${next}px`;
      }
      state.nextHeight = next;
    };
    const handleMouseUp = () => {
      const state = dragStateRef.current;
      if (state?.nextHeight != null) {
        setExpandedHeight(state.nextHeight);
        window.localStorage?.setItem(RUN_BAR_EXPANDED_HEIGHT_STORAGE_KEY, String(state.nextHeight));
      }
      dragStateRef.current = null;
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const getNodeName = useCallback((stepId) => {
    const node = nodes?.find((n) => n.id === stepId);
    return node ? (node.alias || node.id) : stepId;
  }, [nodes]);

  const totalDuration = useMemo(() => {
    if (!flowRun?.nodes) return null;
    let total = 0;
    let hasNonZero = false;
    for (const state of Object.values(flowRun.nodes)) {
      if (state.duration != null && state.duration > 0) {
        total += state.duration;
        hasNonZero = true;
      }
    }
    return hasNonZero ? total : null;
  }, [flowRun?.nodes]);

  const stepEntries = useMemo(() => {
    if (!flowRun?.nodes) return [];
    return Object.entries(flowRun.nodes).filter(
      ([stepId]) => stepId !== 'start' && stepId !== 'end'
    );
  }, [flowRun?.nodes]);

  const firstFailure = useMemo(
    () => stepEntries.find(([, state]) => state.status === 'failed'),
    [stepEntries]
  );

  const executedCount = stepEntries.filter(([, state]) => state.status !== 'idle').length;

  const getFlowStatusInfo = () => {
    if (isFlowRunning) {
      return { bg: STATUS_BADGE_BG.running, color: STATUS_COLORS.running, label: '运行中' };
    }
    if (flowRun?.status === 'success') {
      return { bg: STATUS_BADGE_BG.success, color: STATUS_COLORS.success, label: '成功' };
    }
    if (flowRun?.status === 'failed') {
      return { bg: STATUS_BADGE_BG.failed, color: STATUS_COLORS.failed, label: '失败' };
    }
    if (flowRun?.status === 'cancelled') {
      return { bg: STATUS_BADGE_BG.cancelled, color: STATUS_COLORS.cancelled, label: '已取消' };
    }
    return null;
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case 'running':
        return { icon: SpinningIcon, color: STATUS_COLORS.running, label: '运行中' };
      case 'success':
        return { icon: IconCircleCheck, color: STATUS_COLORS.success, label: '成功' };
      case 'failed':
        return { icon: IconCircleX, color: STATUS_COLORS.failed, label: '失败' };
      case 'cancelled':
        return { icon: IconCircleOff, color: STATUS_COLORS.cancelled, label: '已取消' };
      case 'skipped':
        return { icon: IconCircleOff, color: STATUS_COLORS.skipped, label: '已跳过' };
      default:
        return { icon: null, color: getStatusColor('idle'), label: '等待中' };
    }
  };

  const flowStatusInfo = getFlowStatusInfo();

  const renderStepRows = () => {
    if (stepEntries.length === 0) {
      return <EmptyPanel>暂无运行数据，点击顶栏「运行」开始执行 Flow</EmptyPanel>;
    }
    return stepEntries.map(([stepId, state]) => {
      const { icon: StatusIcon, color: statusColor, label: statusLabel } = getStatusInfo(state.status);
      const isRunningStep = state.status === 'running';
      const isFailed = state.status === 'failed';

      return (
        <StepRow
          key={stepId}
          data-failed={isFailed || undefined}
          $active={selectedNodeId === stepId}
          $failed={isFailed}
          onClick={() => onSelectStep?.(stepId)}
          title="点击在画布中定位该节点"
        >
          {StatusIcon ? (
            isRunningStep ? (
              <SpinningIcon size={16} strokeWidth={1.5} color={statusColor} />
            ) : (
              <StatusIcon size={16} strokeWidth={1.5} color={statusColor} />
            )
          ) : (
            <IconCircleOff size={16} strokeWidth={1.5} color={statusColor} />
          )}
          <StepName>{getNodeName(stepId)}</StepName>
          {state.error && isFailed && (
            <FailureSummary>{String(state.error).split('\n')[0]}</FailureSummary>
          )}
          {state.duration !== null && state.duration !== undefined && (
            <StepDuration>{state.duration}ms</StepDuration>
          )}
          <StepStatus $color={statusColor}>{statusLabel}</StepStatus>
        </StepRow>
      );
    });
  };

  return (
    <>
      <BarRoot>
        {expanded && !fullscreen && (
          <ResizeHandle onMouseDown={handleResizeStart} title="拖拽调整高度" />
        )}
        <BarHeader
          onClick={toggleExpanded}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpanded();
            }
          }}
        >
          {expanded ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
          <span style={{ fontSize: 13, fontWeight: 600 }}>运行</span>
          {flowStatusInfo ? (
            <StatusBadge $bg={flowStatusInfo.bg} $color={flowStatusInfo.color}>
              {isFlowRunning && <SpinningIcon size={12} />}
              {flowStatusInfo.label}
            </StatusBadge>
          ) : (
            <MetaText>未运行</MetaText>
          )}
          {stepEntries.length > 0 && (
            <MetaText>{executedCount}/{stepEntries.length} 步</MetaText>
          )}
          {totalDuration !== null && <MetaText>总耗时 {totalDuration}ms</MetaText>}
          <Spacer />
          {firstFailure && !expanded && (
            <FailureSummary title={String(firstFailure[1].error || '')}>
              {getNodeName(firstFailure[0])}：{String(firstFailure[1].error || '失败').split('\n')[0]}
            </FailureSummary>
          )}
          <BarActionButton
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(true);
            }}
            title="全屏查看运行总览"
            aria-label="全屏查看运行总览"
          >
            <IconMaximize size={15} />
          </BarActionButton>
        </BarHeader>

        {expanded && !fullscreen && (
          <div style={{ height: expandedHeight, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <StepList ref={stepListRef} style={{ flex: 1 }}>
              {renderStepRows()}
            </StepList>
          </div>
        )}
      </BarRoot>

      {fullscreen && (
        <FullscreenOverlay>
          <FullscreenHeader>
            <span>运行总览</span>
            {flowStatusInfo && (
              <StatusBadge $bg={flowStatusInfo.bg} $color={flowStatusInfo.color}>
                {isFlowRunning && <SpinningIcon size={12} />}
                {flowStatusInfo.label}
              </StatusBadge>
            )}
            {stepEntries.length > 0 && (
              <MetaText>{executedCount}/{stepEntries.length} 步</MetaText>
            )}
            {totalDuration !== null && <MetaText>总耗时 {totalDuration}ms</MetaText>}
            <Spacer />
            <BarActionButton
              onClick={() => setFullscreen(false)}
              title="退出全屏"
              aria-label="退出全屏"
            >
              <IconMinimize size={16} />
            </BarActionButton>
          </FullscreenHeader>
          <FullscreenBody>
            {renderStepRows()}
          </FullscreenBody>
        </FullscreenOverlay>
      )}
    </>
  );
};

export default FlowRunBar;
