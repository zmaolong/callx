import React from 'react';
import StyledWrapper from 'components/RequestTabPanel/StyledWrapper';

const FlowTab = ({ flow }) => (
  <StyledWrapper className="flex flex-col flex-grow items-center justify-center" data-testid="flow-tab-placeholder">
    <div className="text-lg font-semibold">{flow?.name || 'Flow'}</div>
    <div className="text-sm opacity-70 mt-2">Flow 编排功能暂未实现</div>
  </StyledWrapper>
);

export default FlowTab;
