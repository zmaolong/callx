/**
 * ConditionEdge — 带条件分支的边。
 *
 * 虚线渲染以区分普通边，中点显示条件摘要标签（截断），hover 展示完整条件。
 */
import React from 'react';
import { SmoothStepEdge, EdgeLabelRenderer } from '@xyflow/react';
import { useTheme } from 'styled-components';
import { summarizeCondition, truncateLabel } from '../constants';

const ConditionEdge = (props) => {
  const theme = useTheme();
  const accent = theme.accent || theme.colors?.accent || '#3b82f6';
  const condition = props.data?.condition;
  const fullText = summarizeCondition(condition);

  return (
    <>
      <SmoothStepEdge
        {...props}
        style={{ ...(props.style || {}), strokeDasharray: '6 4', stroke: accent }}
        markerEnd={props.markerEnd ? { ...props.markerEnd, color: accent } : undefined}
      />
      {fullText && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            title={fullText}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${(props.sourceX + props.targetX) / 2}px, ${(props.sourceY + props.targetY) / 2}px)`,
              pointerEvents: 'all',
              fontSize: 10,
              lineHeight: '14px',
              padding: '1px 6px',
              borderRadius: 8,
              maxWidth: 160,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: theme.background?.crust || '#1e293b',
              border: `1px solid ${accent}`,
              color: accent,
              fontFamily: '\'SF Mono\', \'Fira Code\', \'Consolas\', monospace'
            }}
          >
            {truncateLabel(fullText)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

export default ConditionEdge;
