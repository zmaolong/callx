import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import find from 'lodash/find';
import filter from 'lodash/filter';
import classnames from 'classnames';
import { IconChevronRight, IconChevronLeft, IconChevronDown, IconChevronUp } from '@tabler/icons';
import { useSelector, useDispatch } from 'react-redux';
import { focusTab, reorderTabs } from 'providers/ReduxStore/slices/tabs';
import NewRequest from 'components/Sidebar/NewRequest';
import CollectionHeader from './CollectionHeader';
import RequestTab from './RequestTab';
import StyledWrapper from './StyledWrapper';
import DraggableTab from './DraggableTab';
import CreateTransientRequest from 'components/CreateTransientRequest';
import ActionIcon from 'ui/ActionIcon/index';

const RequestTabs = ({ position = 'top', showCollectionHeader = true, headerOnly = false }) => {
  const isRightPosition = position === 'right';
  const dispatch = useDispatch();
  const tabsRef = useRef();
  const scrollContainerRef = useRef();
  const collectionTabsRef = useRef();
  const [newRequestModalOpen, setNewRequestModalOpen] = useState(false);
  const [tabOverflowStates, setTabOverflowStates] = useState({});
  const [showChevrons, setShowChevrons] = useState(false);
  const tabs = useSelector((state) => state.tabs.tabs);
  const activeTabUid = useSelector((state) => state.tabs.activeTabUid);
  const collections = useSelector((state) => state.collections.collections);
  const leftSidebarWidth = useSelector((state) => state.app.leftSidebarWidth);
  const sidebarCollapsed = useSelector((state) => state.app.sidebarCollapsed);
  const screenWidth = useSelector((state) => state.app.screenWidth);
  const workspaces = useSelector((state) => state.workspaces.workspaces);

  const createSetHasOverflow = useCallback((tabUid) => {
    return (hasOverflow) => {
      setTabOverflowStates((prev) => {
        if (prev[tabUid] === hasOverflow) {
          return prev;
        }
        return {
          ...prev,
          [tabUid]: hasOverflow
        };
      });
    };
  }, []);

  const activeTab = find(tabs, (t) => t.uid === activeTabUid);
  const activeCollection = find(collections, (c) => c?.uid === activeTab?.collectionUid);
  const collectionRequestTabs = filter(tabs, (t) => t.collectionUid === activeTab?.collectionUid);

  const isScratchCollection = useMemo(() => {
    return activeCollection ? workspaces.some((w) => w.scratchCollectionUid === activeCollection.uid) : false;
  }, [workspaces, activeCollection]);

  useEffect(() => {
    if (!activeTabUid || !activeTab) return;

    const checkOverflow = () => {
      if (tabsRef.current && scrollContainerRef.current) {
        const hasOverflow = isRightPosition
          ? tabsRef.current.scrollHeight > scrollContainerRef.current.clientHeight + 1
          : tabsRef.current.scrollWidth > scrollContainerRef.current.clientWidth + 1;
        setShowChevrons(hasOverflow);
      }
    };

    checkOverflow();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(checkOverflow);
    if (scrollContainerRef.current) {
      resizeObserver.observe(scrollContainerRef.current);
    }
    if (tabsRef.current) {
      resizeObserver.observe(tabsRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [activeTabUid, activeTab, collectionRequestTabs.length, screenWidth, leftSidebarWidth, sidebarCollapsed, isRightPosition]);

  const getTabClassname = (tab, index) => {
    return classnames('request-tab select-none', {
      'active': tab.uid === activeTabUid,
      'last-tab': tabs && tabs.length && index === tabs.length - 1,
      'has-overflow': tabOverflowStates[tab.uid]
    });
  };

  const handleClick = (tab) => {
    dispatch(
      focusTab({
        uid: tab.uid
      })
    );
  };

  if (!activeTabUid) {
    return null;
  }

  if (headerOnly) {
    return activeCollection ? (
      <CollectionHeader
        collection={activeCollection}
        isScratchCollection={isScratchCollection}
      />
    ) : null;
  }

  const effectiveSidebarWidth = sidebarCollapsed ? 0 : leftSidebarWidth;
  const maxTablistWidth = screenWidth - effectiveSidebarWidth - 150;

  if (!collectionRequestTabs.length) {
    return null;
  }

  const slide = (offset) => {
    scrollContainerRef.current?.scrollBy(
      isRightPosition
        ? { top: offset, behavior: 'smooth' }
        : { left: offset, behavior: 'smooth' }
    );
  };

  const previousSlide = () => slide(-120);
  const nextSlide = () => slide(120);
  const PreviousIcon = isRightPosition ? IconChevronUp : IconChevronLeft;
  const NextIcon = isRightPosition ? IconChevronDown : IconChevronRight;
  const previousLabel = isRightPosition ? 'Scroll tabs up' : 'Scroll tabs left';
  const nextLabel = isRightPosition ? 'Scroll tabs down' : 'Scroll tabs right';

  // Todo: Must support ephemeral requests
  return (
    <StyledWrapper $position={position}>
      {newRequestModalOpen && (
        <NewRequest collectionUid={activeCollection?.uid} onClose={() => setNewRequestModalOpen(false)} />
      )}
      {showCollectionHeader && activeCollection && (
        <CollectionHeader
          collection={activeCollection}
          isScratchCollection={isScratchCollection}
        />
      )}
      {collectionRequestTabs && collectionRequestTabs.length ? (
        <div className="tabs-layout" ref={collectionTabsRef}>
          <div className={classnames('scroll-chevrons', { hidden: !showChevrons })}>
            <ActionIcon size="lg" onClick={previousSlide} aria-label={previousLabel}>
              <PreviousIcon size={18} strokeWidth={1.5} />
            </ActionIcon>
          </div>
          <div
            className="tabs-scroll-container"
            style={isRightPosition ? undefined : { maxWidth: maxTablistWidth }}
            ref={scrollContainerRef}
          >
            <ul role="tablist" ref={tabsRef}>
              {collectionRequestTabs.map((tab, index) => (
                <DraggableTab
                  key={tab.uid}
                  id={tab.uid}
                  index={index}
                  onMoveTab={(source, target) => {
                    dispatch(reorderTabs({
                      sourceUid: source,
                      targetUid: target
                    }));
                  }}
                  className={getTabClassname(tab, index)}
                  active={tab.uid === activeTabUid}
                  onClick={() => handleClick(tab)}
                >
                  <RequestTab
                    collectionRequestTabs={collectionRequestTabs}
                    tabIndex={index}
                    tab={tab}
                    collection={activeCollection}
                    folderUid={tab.folderUid}
                    hasOverflow={tabOverflowStates[tab.uid]}
                    setHasOverflow={createSetHasOverflow(tab.uid)}
                    dropdownContainerRef={collectionTabsRef}
                  />
                </DraggableTab>
              ))}
            </ul>
          </div>
          {activeCollection && (
            <CreateTransientRequest collectionUid={activeCollection.uid} />
          )}
          <div className={classnames('scroll-chevrons', { hidden: !showChevrons })}>
            <ActionIcon size="lg" onClick={nextSlide} aria-label={nextLabel}>
              <NextIcon size={18} strokeWidth={1.5} />
            </ActionIcon>
          </div>
        </div>
      ) : null}
    </StyledWrapper>
  );
};

export default RequestTabs;
