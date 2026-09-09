import React from 'react';
import { Handle, Position } from '@xyflow/react';

const StartNode = ({ data }) => {
  return (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: '50%',
        background: '#22c55e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        border: '3px solid #16a34a',
        cursor: 'default'
      }}
    >
      Start
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#16a34a', width: 10, height: 10, border: '2px solid #fff' }}
      />
    </div>
  );
};

export default StartNode;
