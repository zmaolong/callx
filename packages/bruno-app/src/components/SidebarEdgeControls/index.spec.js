import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SidebarEdgeControls from './index';

jest.mock('ui/ActionIcon', () => ({ children, onClick, label, ...props }) => (
  <button onClick={onClick} aria-label={label} {...props}>{children}</button>
));

jest.mock('@tabler/icons', () => ({
  IconLayoutSidebarLeftCollapse: () => <span />,
  IconLayoutSidebarLeftExpand: () => <span />,
  IconLayoutSidebarRightCollapse: () => <span />,
  IconLayoutSidebarRightExpand: () => <span />
}));

const renderControls = (appState) => {
  const store = configureStore({
    reducer: {
      app: (state = appState, action) => {
        if (action.type === 'app/setSidebarCollapsed') return { ...state, sidebarCollapsed: action.payload };
        if (action.type === 'app/setTabBarCollapsed') return { ...state, tabBarCollapsed: action.payload };
        if (action.type === 'app/updateLeftSidebarWidth') return { ...state, leftSidebarWidth: action.payload.leftSidebarWidth };
        if (action.type === 'app/updateTabBarWidth') return { ...state, tabBarWidth: action.payload.tabBarWidth };
        return state;
      }
    }
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <SidebarEdgeControls side="left" />
        <SidebarEdgeControls side="right" />
      </Provider>
    )
  };
};

describe('SidebarEdgeControls', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('collapses both sides independently and persists their states', () => {
    const { store, getByTestId } = renderControls({
      leftSidebarWidth: 280,
      sidebarCollapsed: false,
      tabBarWidth: 220,
      tabBarCollapsed: false
    });

    fireEvent.click(getByTestId('toggle-collections-sidebar-button'));
    expect(store.getState().app.sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem('bruno.sidebarCollapsed')).toBe('true');

    fireEvent.click(getByTestId('toggle-tab-bar-button'));
    expect(store.getState().app.tabBarCollapsed).toBe(true);
    expect(store.getState().app.sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem('bruno.tabBarCollapsed')).toBe('true');
  });

  it('restores the saved widths without changing the other side', () => {
    const { store, getByTestId } = renderControls({
      leftSidebarWidth: 280,
      sidebarCollapsed: true,
      tabBarWidth: 320,
      tabBarCollapsed: true
    });

    fireEvent.click(getByTestId('toggle-collections-sidebar-button'));
    expect(store.getState().app.sidebarCollapsed).toBe(false);
    expect(store.getState().app.leftSidebarWidth).toBe(280);
    expect(store.getState().app.tabBarCollapsed).toBe(true);

    fireEvent.click(getByTestId('toggle-tab-bar-button'));
    expect(store.getState().app.tabBarCollapsed).toBe(false);
    expect(store.getState().app.tabBarWidth).toBe(320);
    expect(store.getState().app.sidebarCollapsed).toBe(false);
  });
});
