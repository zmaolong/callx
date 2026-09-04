import styled from 'styled-components';

const Wrapper = styled.div`
  height: 2.1rem;

  .url-input-group {
    border: ${(props) => props.theme.requestTabPanel.url.border};
    border-radius: ${(props) => props.theme.border.radius.base};
    flex: 1;
    min-width: 0;
  }

  .url-path-prefix {
    flex: none;
    padding-left: 0.5rem;
    color: ${(props) => props.theme.colors.text};
    font-size: ${(props) => props.theme.font.size.base};
    line-height: 1;
    user-select: none;
  }

`;

export default Wrapper;
