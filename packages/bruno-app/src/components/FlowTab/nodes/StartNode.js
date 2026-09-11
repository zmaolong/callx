import React from 'react';
import styled from 'styled-components';
import { Handle, Position } from '@xyflow/react';
import { STATUS_COLORS } from '../constants';

const Circle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${STATUS_COLORS.success};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: bold;
  font-size: 12px;
  border: 3px solid ${(props) => props.theme.status?.success?.text || STATUS_COLORS.success};
  cursor: default;
`;

const NodeHandle = styled(Handle)`
  background: ${(props) => props.theme.status?.success?.text || STATUS_COLORS.success} !important;
  width: 10px !important;
  height: 10px !important;
  border: 2px solid #fff !important;
`;

const StartNode = () => {
  return (
    <Circle>
      Start
      <NodeHandle type="source" position={Position.Right} />
    </Circle>
  );
};

export default StartNode;
