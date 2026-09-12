import React, { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand
} from '@tabler/icons';
import ActionIcon from 'ui/ActionIcon';
import {
  setSidebarCollapsed,
  setTabBarCollapsed,
  updateLeftSidebarWidth,
  updateTabBarWidth
} from 'providers/ReduxStore/slices/app';
import {
  setLocalStorageValue,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_WIDTH_KEY,
  TAB_BAR_COLLAPSED_KEY,
  TAB_BAR_WIDTH_KEY
} from 'utils/common/localStorage';

const MIN_LEFT_SIDEBAR_WIDTH = 180;
const MAX_LEFT_SIDEBAR_WIDTH = 600;
const MIN_TAB_BAR_WIDTH = 150;
const MAX_TAB_BAR_WIDTH = 500;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SidebarEdgeControls = ({ side }) => {
  const dispatch = useDispatch();
  const leftSidebarWidth = useSelector((state) => state.app.leftSidebarWidth);
  const sidebarCollapsed = useSelector((state) => state.app.sidebarCollapsed);
  const tabBarWidth = useSelector((state) => state.app.tabBarWidth);
  const tabBarCollapsed = useSelector((state) => state.app.tabBarCollapsed);
  const expandedLeftWidthRef = useRef(leftSidebarWidth);
  const expandedTabWidthRef = useRef(tabBarWidth);

  useEffect(() => {
    if (Number.isFinite(leftSidebarWidth)) {
      expandedLeftWidthRef.current = leftSidebarWidth;
    }
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (Number.isFinite(tabBarWidth)) {
      expandedTabWidthRef.current = tabBarWidth;
    }
  }, [tabBarWidth]);

  if (side === 'left' && (leftSidebarWidth === null || sidebarCollapsed === null)) {
    return null;
  }

  if (side === 'right' && (tabBarWidth === null || tabBarCollapsed === null)) {
    return null;
  }

  if (side === 'left') {
    const width = clamp(expandedLeftWidthRef.current || leftSidebarWidth, MIN_LEFT_SIDEBAR_WIDTH, MAX_LEFT_SIDEBAR_WIDTH);
    const nextCollapsed = !sidebarCollapsed;

    const handleToggle = () => {
      expandedLeftWidthRef.current = width;
      if (!nextCollapsed) {
        dispatch(updateLeftSidebarWidth({ leftSidebarWidth: width }));
      }
      dispatch(setSidebarCollapsed(nextCollapsed));
      setLocalStorageValue(SIDEBAR_WIDTH_KEY, width);
      setLocalStorageValue(SIDEBAR_COLLAPSED_KEY, nextCollapsed);
    };

    return (
      <ActionIcon
        className={`sidebar-edge-toggle collections-edge-toggle ${sidebarCollapsed ? 'edge-toggle-collapsed' : ''}`}
        size="md"
        onClick={handleToggle}
        label={sidebarCollapsed ? 'Show collections sidebar' : 'Hide collections sidebar'}
        aria-label={sidebarCollapsed ? 'Show collections sidebar' : 'Hide collections sidebar'}
        data-testid="toggle-collections-sidebar-button"
      >
        {sidebarCollapsed
          ? <IconLayoutSidebarLeftExpand size={16} strokeWidth={1.5} />
          : <IconLayoutSidebarLeftCollapse size={16} strokeWidth={1.5} />}
      </ActionIcon>
    );
  }

  const width = clamp(expandedTabWidthRef.current || tabBarWidth, MIN_TAB_BAR_WIDTH, MAX_TAB_BAR_WIDTH);
  const nextCollapsed = !tabBarCollapsed;
  const handleToggle = () => {
    expandedTabWidthRef.current = width;
    dispatch(updateTabBarWidth({ tabBarWidth: width }));
    dispatch(setTabBarCollapsed(nextCollapsed));
    setLocalStorageValue(TAB_BAR_WIDTH_KEY, width);
    setLocalStorageValue(TAB_BAR_COLLAPSED_KEY, nextCollapsed);
  };

  return (
    <ActionIcon
      className={`sidebar-edge-toggle tabs-edge-toggle ${tabBarCollapsed ? 'edge-toggle-collapsed' : ''}`}
      size="md"
      onClick={handleToggle}
      label={tabBarCollapsed ? 'Show vertical tabs' : 'Hide vertical tabs'}
      aria-label={tabBarCollapsed ? 'Show vertical tabs' : 'Hide vertical tabs'}
      data-testid="toggle-tab-bar-button"
    >
      {tabBarCollapsed
        ? <IconLayoutSidebarRightExpand size={16} strokeWidth={1.5} />
        : <IconLayoutSidebarRightCollapse size={16} strokeWidth={1.5} />}
    </ActionIcon>
  );
};

export default SidebarEdgeControls;
