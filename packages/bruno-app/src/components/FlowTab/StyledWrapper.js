import styled from 'styled-components';

const FlowTabStyledWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  background: ${(props) => props.theme.background.base};
  color: ${(props) => props.theme.text};
  /* 作为响应全屏浮层的定位基准：全屏只覆盖 Flow Tab 区域，不遮住软件标题栏 */
  position: relative;
  overflow: hidden;

  .flow-canvas-wrapper {
    flex-grow: 1;
    height: 100%;
    position: relative;

    .react-flow__node {
      cursor: pointer;
    }

    .react-flow__node-start,
    .react-flow__node-end {
      cursor: default;
    }

    .react-flow__controls {
      button {
        background: ${(props) => props.theme.background.crust};
        color: ${(props) => props.theme.text};
        border: 1px solid ${(props) => props.theme.border.border1};
        fill: ${(props) => props.theme.text};

        &:hover {
          background: ${(props) => props.theme.background.surface0};
        }
      }
    }

    .react-flow__minimap {
      background: ${(props) => props.theme.background.crust};
      border: 1px solid ${(props) => props.theme.border.border1};
      border-radius: 8px;
    }

    .react-flow__background {
      background: ${(props) => props.theme.background.base};
    }
  }
`;

export default FlowTabStyledWrapper;
