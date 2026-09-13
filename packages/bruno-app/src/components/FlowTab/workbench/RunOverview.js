/**
 * RunOverview — 运行总览：历史回看下拉、整体状态徽标与步骤列表。
 */
import React, { useMemo } from 'react';
import { STATUS_BADGE_BG, STATUS_COLORS } from '../constants';
import {
  DetailSection,
  DetailTitle,
  DetailTitleRow,
  HistoryRow,
  HistorySelect,
  MutedText,
  OverviewStepRow,
  OverviewSteps,
  QuickMapButton,
  ResultMeta,
  SpinningIcon,
  StatusBadge,
  StepDurationText,
  StepErrorText,
  StepHttpStatusText,
  StepNameText,
  StepStatusText,
  formatHistoryLabel,
  getFlowStatusInfo,
  getRunStatusInfo
} from './styled';

const RunOverview = ({
  displayRun,
  viewingRecord,
  flowHistory,
  selectedNodeId,
  onSelectStep,
  onHistorySelect,
  onClearHistory,
  onExportReport,
  exporting,
  getNodeName
}) => {
  const stepEntries = useMemo(() => {
    if (!displayRun?.nodes) return [];
    return Object.entries(displayRun.nodes).filter(
      ([stepId]) => stepId !== 'start' && stepId !== 'end'
    );
  }, [displayRun?.nodes]);

  const totalDuration = useMemo(() => {
    if (!displayRun?.nodes) return null;
    let total = 0;
    let hasNonZero = false;
    for (const state of Object.values(displayRun.nodes)) {
      if (state.duration != null && state.duration > 0) {
        total += state.duration;
        hasNonZero = true;
      }
    }
    return hasNonZero ? total : null;
  }, [displayRun?.nodes]);

  if (!displayRun) {
    return (
      <DetailSection>
        <DetailTitle>运行总览</DetailTitle>
        <MutedText>尚未运行，点击顶栏「运行」或「单跑此节点」开始</MutedText>
      </DetailSection>
    );
  }

  const flowStatusInfo = getFlowStatusInfo(displayRun.status);
  const executedCount = stepEntries.filter(([, state]) => state.status !== 'idle').length;
  const hasLiveRun = Boolean(displayRun && !viewingRecord);

  return (
    <DetailSection>
      <DetailTitleRow>
        <DetailTitle>运行总览</DetailTitle>
        {viewingRecord && (
          <StatusBadge $bg={STATUS_BADGE_BG.running} $color={STATUS_COLORS.running}>
            回看历史
          </StatusBadge>
        )}
        {flowStatusInfo && (
          <StatusBadge $bg={flowStatusInfo.bg} $color={flowStatusInfo.color}>
            {!viewingRecord && displayRun.status === 'running' && <SpinningIcon size={12} />}
            {flowStatusInfo.label}
          </StatusBadge>
        )}
      </DetailTitleRow>
      {(hasLiveRun || (flowHistory && flowHistory.length > 0)) && (
        <HistoryRow>
          <HistorySelect
            value={viewingRecord?.runId || ''}
            onChange={onHistorySelect}
            title="查看运行历史"
            aria-label="运行历史选择"
          >
            <option value="">本次运行</option>
            {(flowHistory || []).map((meta) => (
              <option key={meta.runId} value={meta.runId}>
                {formatHistoryLabel(meta)}
              </option>
            ))}
          </HistorySelect>
          {flowHistory && flowHistory.length > 0 && (
            <QuickMapButton onClick={onClearHistory} title="清空此 Flow 的全部运行历史">
              清空历史
            </QuickMapButton>
          )}
          {onExportReport && (
            <QuickMapButton
              onClick={onExportReport}
              disabled={exporting || displayRun.status === 'running'}
              title="导出运行报告（Markdown / 自包含 HTML，敏感头默认脱敏）"
            >
              导出报告
            </QuickMapButton>
          )}
        </HistoryRow>
      )}
      <OverviewSteps>
        {stepEntries.map(([stepId, state]) => {
          const statusInfo = getRunStatusInfo(state.status);
          const isFailed = state.status === 'failed';
          return (
            <OverviewStepRow
              key={stepId}
              $active={selectedNodeId === stepId}
              $failed={isFailed}
              onClick={() => onSelectStep?.(stepId)}
              title="点击查看该步骤详情"
            >
              <StepStatusText $color={statusInfo?.color}>{statusInfo?.label}</StepStatusText>
              <StepNameText>{getNodeName(stepId)}</StepNameText>
              {isFailed && state.error && (
                <StepErrorText title={String(state.error)}>
                  {String(state.error).split('\n')[0]}
                </StepErrorText>
              )}
              {state.duration !== null && state.duration !== undefined && (
                <StepDurationText>{state.duration}ms</StepDurationText>
              )}
              {state.httpStatus !== null && state.httpStatus !== undefined && (
                <StepHttpStatusText $ok={state.httpStatus < 400}>{state.httpStatus}</StepHttpStatusText>
              )}
            </OverviewStepRow>
          );
        })}
      </OverviewSteps>
      <ResultMeta style={{ display: 'block', marginTop: 6 }}>
        {executedCount}/{stepEntries.length} 步{totalDuration !== null ? ` · 总耗时 ${totalDuration}ms` : ''}
      </ResultMeta>
    </DetailSection>
  );
};

export default RunOverview;
