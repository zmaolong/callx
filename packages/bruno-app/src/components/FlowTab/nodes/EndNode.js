import React from 'react';
import { Handle, Position } from '@xyflow/react';

const EndNode = ({ data }) => {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#ef4444',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        border: '3px solid #dc2626',
        cursor: 'default'
      }}
    >
      End
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#dc2626', width: 10, height: 10, border: '2px solid #fff' }}
      />
    </div>
  );
};

export default EndNode;
