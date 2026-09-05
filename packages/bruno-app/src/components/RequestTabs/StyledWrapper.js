import styled from 'styled-components';

const Wrapper = styled.div`
  position: relative;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: ${(props) => props.theme.requestTabs.bottomBorder};
    z-index: 0;
  }

  .tabs-layout {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-left: 0.5rem;
  }

  .scroll-chevrons.hidden {
    display: none;
  }

  .tabs-scroll-container {
    overflow-x: auto;
    overflow-y: clip;
    min-width: 0;

    &::-webkit-scrollbar {
      display: none;
    }

    scrollbar-width: none;

    ul {
      margin-bottom: 0;
      overflow: visible;
    }
  }

  ul {
    padding: 0 3px;
    margin: 0;
    display: flex;
    align-items: flex-end;
    position: relative;

    &::-webkit-scrollbar {
      display: none;
    }

    scrollbar-width: none;

    li {
      display: inline-flex;
      max-width: 180px;
      min-width: 80px;
      list-style: none;
      cursor: pointer;
      font-size: 0.8125rem;
      position: relative;
      margin-right: 3px;
      color: ${(props) => props.theme.requestTabs.color};
      background: transparent;
      border: 1px solid transparent;
      padding: 6px 0;
      flex-shrink: 0;
      margin-bottom: 3px;

      .tab-container {
        width: 100%;
        position: relative;
        overflow: hidden;
      }

      &:not(.active) {
        background: ${(props) => props.theme.requestTabs.bg};
        border-color: transparent;
        border-radius: ${(props) => props.theme.border.radius.base};
      }

      &:nth-last-child(1) {
        margin-right: 4px;
      }

      &.has-overflow:not(:hover) .tab-name {
        mask-image: linear-gradient(to right, ${(props) => props.theme.requestTabs.color} 0%, ${(props) => props.theme.requestTabs.color} calc(100% - 12px), transparent 100%);
        -webkit-mask-image: linear-gradient(to right, ${(props) => props.theme.requestTabs.color} 0%, ${(props) => props.theme.requestTabs.color} calc(100% - 12px), transparent 100%);
      }

      &.has-overflow:hover .tab-name {
        mask-image: linear-gradient(to right, ${(props) => props.theme.requestTabs.color} 0%, ${(props) => props.theme.requestTabs.color} calc(100% - 8px), transparent 100%);
        -webkit-mask-image: linear-gradient(to right, ${(props) => props.theme.requestTabs.color} 0%, ${(props) => props.theme.requestTabs.color} calc(100% - 8px), transparent 100%);
      }

      &.active {
        background: ${(props) => props.theme.bg || '#ffffff'};
        border: 1px solid ${(props) => props.theme.requestTabs.bottomBorder};
        border-bottom-color: ${(props) => props.theme.bg || '#ffffff'};
        border-radius: 8px 8px 0 0;
        z-index: 1;
        margin-bottom: -2px;
        padding-bottom: 12px;

        &::before,
        &::after {
          content: '';
          position: absolute;
          bottom: 1px;
          width: 8px;
          height: 8px;
          background: transparent;
          border-bottom: 1px solid ${(props) => props.theme.requestTabs.bottomBorder};
        }

        &::before {
          left: -8px;
          border-bottom-right-radius: 6px;
          box-shadow: 3px 3px 0 0 ${(props) => props.theme.bg || '#ffffff'};
          border-right: 1px solid ${(props) => props.theme.requestTabs.bottomBorder};
        }

        &::after {
          right: -8px;
          border-bottom-left-radius: 6px;
          box-shadow: -3px 3px 0 0 ${(props) => props.theme.bg || '#ffffff'};
          border-left: 1px solid ${(props) => props.theme.requestTabs.bottomBorder};
        }
      }

      &.short-tab {
        width: 32px;
        min-width: 32px;
        max-width: 32px;
        padding: 5px 0;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        color: ${(props) => props.theme.text};
        background-color: transparent;
        border: 1px solid transparent;
        border-radius: ${(props) => props.theme.border.radius.base};
        flex-shrink: 0;

        > div {
          padding: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: ${(props) => props.theme.border.radius.sm};
          transition: background-color 0.12s ease, color 0.12s ease;
        }

        > div.home-icon-container {
          padding: 3px 7px;
        }

        &.choose-request > div {
          padding: 3px 5px;
        }

        svg {
          height: 20px;
          width: 20px;
        }

        &:hover > div {
          background-color: ${(props) => props.theme.background.surface0};
          color: ${(props) => props.theme.text};
        }
      }
    }
  }

  ${(props) => props.$position === 'right' && `
    display: flex;
    flex-direction: column;
    width: 220px;
    min-width: 220px;
    height: 100%;
    border-left: 0;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: ${props.theme.requestTabs.bottomBorder};
      z-index: 1;
      pointer-events: none;
    }

    &::after {
      display: none;
    }

    .tabs-layout {
      flex: 1;
      min-height: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 0.25rem;
      padding: 0.5rem 0.25rem;
    }

    .tabs-scroll-container {
      flex: 1;
      min-height: 0;
      overflow-x: clip;
      overflow-y: auto;
    }

    ul {
      flex-direction: column;
      align-items: stretch;
      padding: 0;

      li {
        display: flex;
        width: 100%;
        min-width: 0;
        max-width: none;
        margin: 0 0 3px;
        padding: 6px 0;

        &:nth-last-child(1) {
          margin-right: 0;
        }

        &.active {
          z-index: 2;
          border: 1px solid ${props.theme.requestTabs.bottomBorder};
          border-radius: 8px;
          margin-left: 0;
          margin-right: 0;
          margin-bottom: 3px;
          padding-bottom: 6px;

          &::before,
          &::after {
            display: none;
          }
        }
      }
    }
  `}

  .special-tab-icon {
    color: ${(props) => props.theme.primary.text};
  }
`;

export default Wrapper;
