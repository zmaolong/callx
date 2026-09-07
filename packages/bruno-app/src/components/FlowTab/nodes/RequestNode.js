import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { useTheme } from 'styled-components';

const RequestNode = ({ data }) => {
  const theme = useTheme();
  const displayName = data.alias || data.label || 'Request';
  const requestType = data.type || 'request';
  const statusColor = data.executionStatus === 'success' ? '#22c55e'
    : data.executionStatus === 'failed' ? '#ef4444'
      : data.executionStatus === 'running' ? '#3b82f6'
        : data.executionStatus === 'cancelled' ? '#f59e0b'
          : data.executionStatus === 'skipped' ? '#94a3b8'
            : theme.colors?.text?.muted || '#64748b';

  return (
    <div
      style={{
        minWidth: 160,
        padding: '10px 14px',
        borderRadius: 8,
        background: theme.background?.surface0 || '#1e293b',
        border: `2px solid ${statusColor}`,
        color: theme.text || '#e2e8f0',
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '18px' }}>
          {displayName}
        </span>
      </div>
      {data.alias && (
        <div style={{ fontSize: 11, color: theme.colors?.text?.muted || '#94a3b8', marginTop: 2, paddingLeft: 14 }}>
          {data.label}
        </div>
      )}
      {data.duration !== undefined && (
        <div style={{ fontSize: 10, color: theme.colors?.text?.subtext0 || '#64748b', marginTop: 2, paddingLeft: 14 }}>
          {data.duration}ms
        </div>
      )}
      {data.httpStatus && (
        <div
          style={{
            fontSize: 10,
            color: data.httpStatus < 400 ? '#22c55e' : '#ef4444',
            marginTop: 2,
            paddingLeft: 14
          }}
        >
          HTTP {data.httpStatus}
        </div>
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
