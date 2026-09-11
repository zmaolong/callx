import React from 'react';
import styled from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { STATUS_COLORS } from '../constants';

const Circle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${STATUS_COLORS.failed};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 12px;
  border: 3px solid ${(props) => props.theme.status?.danger?.text || STATUS_COLORS.failed};
  cursor: default;
`;

const NodeHandle = styled(Handle)`
  background: ${(props) => props.theme.status?.danger?.text || STATUS_COLORS.failed} !important;
  width: 10px !important;
  height: 10px !important;
  border: 2px solid #fff !important;
`;

const EndNode = () => {
  return (
    <Circle>
      End
      <NodeHandle type="target" position={Position.Left} />
    </Circle>
  );
};

export default EndNode;
