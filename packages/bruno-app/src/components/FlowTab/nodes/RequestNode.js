import React from 'react';
import styled, { keyframes, useTheme } from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { getStatusColor, getMethodColor } from '../constants';
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Spinner = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 2px solid ${(props) => props.$color};
  border-top-color: transparent;
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;
  flex-shrink: 0;
`;

const StrategyBadge = styled.span`
  position: absolute;
  right: 6px;
  bottom: 4px;
  font-size: 9px;
  line-height: 12px;
  padding: 0 4px;
  border-radius: 6px;
  background: ${(props) => props.$bg};
  color: ${(props) => props.$color};
  white-space: nowrap;
`;

const RequestNode = ({ data }) => {
  const theme = useTheme();
  const displayName = data.alias || data.label || data.url || 'Request';
  const status = data.executionStatus;
  const statusColor = getStatusColor(status, theme.colors?.text?.muted || '#64748b');
  const method = String(data.method || '').toUpperCase();
  const methodColor = getMethodColor(method);
  const strategy = data.errorHandler?.strategy;

  return (
    <div
      style={{
        minWidth: 180,
        maxWidth: 260,
        padding: '8px 12px',
        borderRadius: 8,
        background: theme.background?.surface0 || theme.background?.base || 'transparent',
        border: `2px solid ${statusColor}`,
        color: theme.text || 'inherit',
        fontSize: 13,
        cursor: 'pointer',
        position: 'relative'
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: statusColor, width: 10, height: 10, border: '2px solid #fff' }}
      />

      {/* 第一行：状态指示 + 方法徽标 + 别名 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {status === 'running' ? (
          <Spinner $color={statusColor} />
        ) : (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: statusColor,
              flexShrink: 0
            }}
          />
        )}
        {method && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              lineHeight: '14px',
              padding: '0 4px',
              borderRadius: 4,
              color: methodColor,
              border: `1px solid ${methodColor}`,
              flexShrink: 0
            }}
          >
            {method}
          </span>
        )}
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            lineHeight: '18px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={displayName}
        >
          {displayName}
        </span>
      </div>

      {/* 第二行：URL（有别名为标题时展示，截断） */}
      {data.url && data.alias && (
        <div
          style={{
            fontSize: 11,
            color: theme.colors?.text?.muted || '#94a3b8',
            marginTop: 2,
            paddingLeft: 14,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={data.url}
        >
          {data.url}
        </div>
      )}

      {/* 第三行：运行结果（耗时 + HTTP 状态码） */}
      {(data.duration !== undefined || data.httpStatus) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, paddingLeft: 14, fontSize: 10 }}>
          {data.duration !== undefined && (
            <span style={{ color: theme.colors?.text?.subtext0 || '#64748b' }}>{data.duration}ms</span>
          )}
          {data.httpStatus && (
            <span style={{ color: data.httpStatus < 400 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
              HTTP {data.httpStatus}
            </span>
          )}
        </div>
      )}

      {/* 错误处理策略徽标（默认 stop 不显示） */}
      {strategy === 'continue' && (
        <StrategyBadge $bg="rgba(245,158,11,0.15)" $color="#f59e0b">失败继续</StrategyBadge>
      )}
      {strategy === 'jump' && (
        <StrategyBadge $bg="rgba(168,85,247,0.15)" $color="#a855f7">失败跳转</StrategyBadge>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: statusColor, width: 10, height: 10, border: '2px solid #fff' }}
      />
    </div>
  );
};

export default RequestNode;
