import { SidebarAccordionProvider } from './SidebarAccordionContext';
import SidebarContent from './SidebarContent';
import StyledWrapper from './StyledWrapper';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import SidebarEdgeControls from 'components/SidebarEdgeControls';
import { updateLeftSidebarWidth, updateIsDragging, toggleSidebarSearch, setSidebarCollapsed } from 'providers/ReduxStore/slices/app';
import { setLocalStorageValue, SIDEBAR_WIDTH_KEY, SIDEBAR_COLLAPSED_KEY } from 'utils/common/localStorage';
import CollectionsSection from './Sections/CollectionsSection/index';
import ApiSpecsSection from './Sections/ApiSpecsSection/index';
import MockServersSection from './Sections/MockServersSection/index';
import useKeybinding from 'hooks/useKeybinding';
import useClearSidebarSelectionOnEscape from 'hooks/useClearSidebarSelectionOnEscape';
import { useBetaFeature, BETA_FEATURES } from 'utils/beta-features';

const MIN_LEFT_SIDEBAR_WIDTH = 180;
const HIDE_SIDEBAR_THRESHOLD = 96;
const MAX_LEFT_SIDEBAR_WIDTH = 600;

const Sidebar = () => {
  const isMockServerEnabled = useBetaFeature(BETA_FEATURES.MOCK_SERVER);
  const sidebarSections = useMemo(() => {
    const sections = [
      {
        id: 'collections',
        component: CollectionsSection
      },
      {
        id: 'api-specs',
        component: ApiSpecsSection
      }
    ];

    if (isMockServerEnabled) {
      sections.push({
        id: 'mock-servers',
        component: MockServersSection
      });
    }

    return sections;
  }, [isMockServerEnabled]);
  const leftSidebarWidth = useSelector((state) => state.app.leftSidebarWidth);
  const sidebarCollapsed = useSelector((state) => state.app.sidebarCollapsed);
  const [asideWidth, setAsideWidth] = useState(leftSidebarWidth);
  const lastWidthRef = useRef(leftSidebarWidth);
  const expandedWidthRef = useRef(leftSidebarWidth);

  const dispatch = useDispatch();
  const [dragging, setDragging] = useState(false);

  // Sidebar search
  useKeybinding('sidebarSearch', (e) => {
    const target = e?.target || document.activeElement;
    if (target?.closest?.('.CodeMirror')) return; // let editor's native `Find` handle it
    dispatch(toggleSidebarSearch());
    return false;
  });

  useClearSidebarSelectionOnEscape();

  const displayWidth = dragging ? asideWidth : leftSidebarWidth;
  const currentWidth = sidebarCollapsed ? 0 : displayWidth;

  // Clamp helper keeps width in allowed range
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const handleMouseMove = useCallback((e) => {
    if (!dragging || sidebarCollapsed) return;
    e.preventDefault();
    const nextWidth = clamp(e.clientX + 2, 0, MAX_LEFT_SIDEBAR_WIDTH);
    if (Math.abs(nextWidth - lastWidthRef.current) < 3) return;
    lastWidthRef.current = nextWidth;
    setAsideWidth(nextWidth);
  }, [dragging, sidebarCollapsed]);

  const handleMouseUp = useCallback((e) => {
    if (dragging) {
      e.preventDefault();
      setDragging(false);
      const shouldCollapse = asideWidth < HIDE_SIDEBAR_THRESHOLD;
      const finalWidth = shouldCollapse
        ? expandedWidthRef.current
        : clamp(asideWidth, MIN_LEFT_SIDEBAR_WIDTH, MAX_LEFT_SIDEBAR_WIDTH);
      setAsideWidth(finalWidth);
      lastWidthRef.current = finalWidth;
      if (!shouldCollapse) {
        expandedWidthRef.current = finalWidth;
      }
      dispatch(
        updateLeftSidebarWidth({
          leftSidebarWidth: finalWidth
        })
      );
      dispatch(setSidebarCollapsed(shouldCollapse));
      setLocalStorageValue(SIDEBAR_WIDTH_KEY, finalWidth);
      setLocalStorageValue(SIDEBAR_COLLAPSED_KEY, shouldCollapse);
      dispatch(
        updateIsDragging({
          isDragging: false
        })
      );
    }
  }, [dragging, asideWidth, dispatch]);
  const handleDragbarMouseDown = (e) => {
    e.preventDefault();
    if (sidebarCollapsed) {
      return;
    }
    setAsideWidth(leftSidebarWidth);
    lastWidthRef.current = leftSidebarWidth;
    expandedWidthRef.current = leftSidebarWidth;
    setDragging(true);
    dispatch(
      updateIsDragging({
        isDragging: true
      })
    );
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [dragging, asideWidth, handleMouseMove, handleMouseUp]);

  if (leftSidebarWidth === null || sidebarCollapsed === null) {
    return null;
  }

  return (
    <SidebarAccordionProvider defaultExpanded={['collections']}>
      <StyledWrapper
        className="flex relative h-full"
        style={{
          width: currentWidth,
          minWidth: currentWidth,
          flexShrink: 0,
          transition: dragging ? 'none' : 'width 0.2s ease-in-out'
        }}
      >
        <aside className="sidebar" data-testid="sidebar" style={{ width: currentWidth, transition: dragging ? 'none' : 'width 0.2s ease-in-out' }}>
          <div className="flex flex-row h-full w-full">
            <div className="flex flex-col w-full" style={{ width: displayWidth }}>
              <div className="flex flex-col flex-grow sidebar-sections-container" style={{ minHeight: 0, overflow: 'hidden' }}>
                <div className="sidebar-sections flex flex-col flex-1">
                  <SidebarContent
                    sections={sidebarSections}
                  />
                </div>
              </div>
            </div>
          </div>
        </aside>

        {!sidebarCollapsed && (
          <div className="absolute sidebar-drag-handle h-full" data-testid="sidebar-drag-handle" onMouseDown={handleDragbarMouseDown}>
            <div className="drag-request-border" />
          </div>
        )}
        <SidebarEdgeControls side="left" />
      </StyledWrapper>
    </SidebarAccordionProvider>
  );
};

export default Sidebar;
