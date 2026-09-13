/**
 * NodeDetail — 选中节点的运行详情：状态徽标、错误、断言明细、请求预览、
 * 输入变量、响应体（含全屏浮层）。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  IconMaximize,
  IconMinimize,
  IconArrowRight
} from '@tabler/icons';
import FlowResponseView from '../FlowResponseView';
import { STATUS_COLORS } from '../constants';
import {
  AssertionExpr,
  AssertionErrorText,
  AssertionList,
  AssertionRow,
  AssertionRowHead,
  AssertionStatusDot,
  DetailSection,
  DetailTable,
  DetailTitle,
  DetailTitleRow,
  ErrorText,
  HttpStatusText,
  IconButton,
  MutedText,
  PreviewBody,
  QuickMapButton,
  RequestPreview,
  ResponseFullscreen,
  ResponseFullscreenHeader,
  ResultMeta,
  ResultStatusRow,
  RoundError,
  RoundIndex,
  RoundItem,
  RoundItemText,
  RoundMeta,
  RoundStatusDot,
  SpinningIcon,
  StatusBadge,
  getRunStatusInfo
} from './styled';

const formatJson = (data) => {
  if (data === null || data === undefined) return 'null';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

const NodeDetail = ({
  selectedNode,
  displayRun,
  requestItem,
  collection,
  edges,
  onQuickMap
}) => {
  const [responseFullscreen, setResponseFullscreen] = useState(false);

  const hasDownstreamNode = useCallback((stepId) => {
    if (!edges) return false;
    return edges.some((e) => e.source === stepId && e.target !== 'end');
  }, [edges]);

  const detail = useMemo(() => {
    if (!selectedNode) return { kind: 'empty' };
    const nodeType = selectedNode.data?.type || selectedNode.type;
    if (nodeType === 'start' || nodeType === 'end') return { kind: 'terminal' };

    const runState = displayRun?.nodes?.[selectedNode.id];
    if (!runState || runState.status === 'idle') return { kind: 'not-run' };
    return { kind: 'detail', runState, nodeType };
  }, [selectedNode, displayRun]);

  if (detail.kind === 'empty') {
    return (
      <DetailSection>
        <DetailTitle>节点详情</DetailTitle>
        <MutedText>点击总览中的步骤或画布节点查看详情</MutedText>
      </DetailSection>
    );
  }

  if (detail.kind === 'terminal') {
    return (
      <DetailSection>
        <DetailTitle>节点详情</DetailTitle>
        <MutedText>Start / End 节点不产生运行结果</MutedText>
      </DetailSection>
    );
  }

  if (detail.kind === 'not-run') {
    return (
      <DetailSection>
        <DetailTitle>节点详情</DetailTitle>
        <MutedText>该节点尚未运行，点击顶栏「运行」或「单跑此节点」开始</MutedText>
      </DetailSection>
    );
  }

  const runState = detail.runState;
  const isLoop = detail.nodeType === 'loop';
  const statusInfo = getRunStatusInfo(runState.status);
  const requestSent = runState.requestSent;

  return (
    <>
      <ResultStatusRow>
        {statusInfo && (
          <StatusBadge $bg={statusInfo.bg} $color={statusInfo.color}>
            {runState.status === 'running' && <SpinningIcon size={12} />}
            {statusInfo.label}
          </StatusBadge>
        )}
        {runState.duration !== null && runState.duration !== undefined && (
          <ResultMeta>{runState.duration}ms</ResultMeta>
        )}
        {runState.httpStatus !== null && runState.httpStatus !== undefined && (
          <HttpStatusText $color={runState.httpStatus < 400 ? STATUS_COLORS.success : STATUS_COLORS.failed}>
            HTTP {runState.httpStatus}
          </HttpStatusText>
        )}
      </ResultStatusRow>

      {runState.error && (
        <DetailSection>
          <DetailTitle>错误</DetailTitle>
          <ErrorText>{runState.error}</ErrorText>
        </DetailSection>
      )}

      {isLoop ? (
        <DetailSection>
          <DetailTitle>
            {`迭代轮次（${runState.loopProgress?.current ?? 0}/${runState.loopProgress?.total ?? 0}）`}
          </DetailTitle>
          {(runState.rounds || []).map((round) => (
            <RoundItem key={round.index} open={round.status === 'failed'}>
              <summary>
                <RoundStatusDot $failed={round.status === 'failed'} />
                <RoundIndex>第 {round.index + 1} 轮</RoundIndex>
                <RoundItemText title={round.item}>{round.item}</RoundItemText>
                <RoundMeta>{round.durationMs}ms</RoundMeta>
              </summary>
              {round.error && <RoundError>{round.error}</RoundError>}
            </RoundItem>
          ))}
          {(!runState.rounds || runState.rounds.length === 0) && runState.status !== 'running' && (
            <MutedText>空数据源：未执行任何轮次</MutedText>
          )}
          {runState.loopProgress?.collectedCount > 0 && (
            <ResultMeta style={{ display: 'block', marginTop: 6 }}>
              已收集 {runState.loopProgress.collectedCount} 项（完成后链可用 {'{{$flow.<循环>.collected}}'} 引用）
            </ResultMeta>
          )}
        </DetailSection>
      ) : (
        <>
          {runState.assertionResults && runState.assertionResults.length > 0 && (
            <DetailSection>
              <DetailTitle>
                {`断言 (${runState.assertionResults.filter((a) => a.status === 'pass').length}/${runState.assertionResults.length} 通过)`}
              </DetailTitle>
              <AssertionList>
                {runState.assertionResults.map((assertion, index) => (
                  <AssertionRow key={assertion.uid || index} $failed={assertion.status === 'fail'}>
                    <AssertionRowHead>
                      <AssertionStatusDot $failed={assertion.status === 'fail'} />
                      <AssertionExpr>
                        {assertion.lhsExpr} {assertion.operator} {assertion.rhsExpr}
                      </AssertionExpr>
                    </AssertionRowHead>
                    {assertion.status === 'fail' && assertion.error && (
                      <AssertionErrorText>{assertion.error}</AssertionErrorText>
                    )}
                  </AssertionRow>
                ))}
              </AssertionList>
            </DetailSection>
          )}

          {requestSent && (
            <DetailSection>
              <DetailTitle>请求预览</DetailTitle>
              <RequestPreview>
                <summary>
                  {requestSent.method ? `${requestSent.method} ` : ''}
                  {requestSent.url || '(未记录 URL)'}
                </summary>
                <PreviewBody>
                  <DetailTable>
                    <tbody>
                      {requestSent.url && (
                        <tr>
                          <td>URL</td>
                          <td>{requestSent.url}</td>
                        </tr>
                      )}
                      {requestSent.headers && Object.entries(requestSent.headers).map(([key, value]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{String(value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DetailTable>
                </PreviewBody>
              </RequestPreview>
            </DetailSection>
          )}

          {runState.inputVariables && Object.keys(runState.inputVariables).length > 0 && (
            <DetailSection>
              <DetailTitle>输入变量</DetailTitle>
              <DetailTable>
                <tbody>
                  {Object.entries(runState.inputVariables).map(([key, value]) => (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>{formatJson(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </DetailTable>
            </DetailSection>
          )}

          {runState.body !== null && runState.body !== undefined && (
            <DetailSection>
              <DetailTitleRow>
                <DetailTitle>响应体</DetailTitle>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {onQuickMap && hasDownstreamNode(selectedNode.id) && (
                    <QuickMapButton
                      onClick={() => onQuickMap(selectedNode.id)}
                      title="为此节点的下游节点创建响应映射"
                    >
                      <IconArrowRight size={12} />
                      映射到下游
                    </QuickMapButton>
                  )}
                  <QuickMapButton
                    onClick={() => setResponseFullscreen(true)}
                    title="全屏查看响应"
                  >
                    <IconMaximize size={12} />
                    全屏
                  </QuickMapButton>
                </div>
              </DetailTitleRow>
              <div style={{ height: 420, display: 'flex', flexDirection: 'column' }}>
                <FlowResponseView
                  requestItem={requestItem}
                  collection={collection}
                  runState={runState}
                />
              </div>
            </DetailSection>
          )}

          {responseFullscreen && (
            <ResponseFullscreen>
              <ResponseFullscreenHeader>
                <span>响应 · {selectedNode.data?.alias || selectedNode.id}</span>
                <IconButton
                  onClick={() => setResponseFullscreen(false)}
                  title="退出全屏"
                  aria-label="退出全屏"
                >
                  <IconMinimize size={16} />
                </IconButton>
              </ResponseFullscreenHeader>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <FlowResponseView
                  requestItem={requestItem}
                  collection={collection}
                  runState={runState}
                />
              </div>
            </ResponseFullscreen>
          )}
        </>
      )}
    </>
  );
};

export default NodeDetail;
