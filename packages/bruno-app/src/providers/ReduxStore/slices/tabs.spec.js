import reducer, { addTab, restoreTabs, updateTabType } from 'providers/ReduxStore/slices/tabs';

const COLLECTION_UID = 'col-1';
const MOCK_SERVER_UID = 'mock-server-1';

const makeCollection = () => ({
  uid: COLLECTION_UID,
  pathname: '/workspace/collections/demo'
});

describe('tabs Flow 类型修复', () => {
  it('addTab 打开 Flow 时升级同 UID 的旧 folder-settings Tab', () => {
    const state = reducer({
      tabs: [{ uid: 'flow-1', collectionUid: COLLECTION_UID, pathname: '/flow/flow-1', type: 'folder-settings' }],
      activeTabUid: null,
      recentlyClosedTabs: []
    }, addTab({
      uid: 'flow-1',
      collectionUid: COLLECTION_UID,
      pathname: '/flow/flow-1',
      type: 'flow'
    }));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe('flow');
    expect(state.activeTabUid).toBe('flow-1');
  });

  it('updateTabType 只修改目标 Tab 类型', () => {
    const state = reducer({
      tabs: [
        { uid: 'flow-1', type: 'folder-settings' },
        { uid: 'request-1', type: 'http-request' }
      ],
      activeTabUid: null,
      recentlyClosedTabs: []
    }, updateTabType({ uid: 'flow-1', type: 'flow' }));

    expect(state.tabs[0].type).toBe('flow');
    expect(state.tabs[1].type).toBe('http-request');
  });
});

describe('tabs mock-server dedup', () => {
  it('addTab focuses existing mock-server tab for the same mockServerUid', () => {
    let state = reducer(undefined, addTab({
      uid: MOCK_SERVER_UID,
      collectionUid: COLLECTION_UID,
      mockServerUid: MOCK_SERVER_UID,
      tabName: 'Dog API',
      type: 'mock-server'
    }));

    state = reducer(state, addTab({
      uid: 'other-uid',
      collectionUid: COLLECTION_UID,
      mockServerUid: MOCK_SERVER_UID,
      tabName: 'Dog API',
      type: 'mock-server'
    }));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].uid).toBe(MOCK_SERVER_UID);
    expect(state.activeTabUid).toBe(MOCK_SERVER_UID);
  });

  it('addTab focuses legacy mock-server-dashboard tab and migrates type to mock-server', () => {
    const legacyState = {
      tabs: [{
        uid: MOCK_SERVER_UID,
        collectionUid: COLLECTION_UID,
        mockServerUid: MOCK_SERVER_UID,
        type: 'mock-server-dashboard',
        tabName: 'Dog API'
      }],
      activeTabUid: null,
      recentlyClosedTabs: []
    };

    const state = reducer(legacyState, addTab({
      uid: 'new-uid',
      collectionUid: COLLECTION_UID,
      mockServerUid: MOCK_SERVER_UID,
      tabName: 'Dog API',
      type: 'mock-server'
    }));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe('mock-server');
    expect(state.activeTabUid).toBe(MOCK_SERVER_UID);
  });

  it('addTab focuses legacy mocker tab and migrates type to mock-server', () => {
    const legacyState = {
      tabs: [{
        uid: MOCK_SERVER_UID,
        collectionUid: COLLECTION_UID,
        mockServerUid: MOCK_SERVER_UID,
        type: 'mocker',
        tabName: 'Dog API'
      }],
      activeTabUid: null,
      recentlyClosedTabs: []
    };

    const state = reducer(legacyState, addTab({
      uid: 'new-uid',
      collectionUid: COLLECTION_UID,
      mockServerUid: MOCK_SERVER_UID,
      tabName: 'Dog API',
      type: 'mock-server'
    }));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].type).toBe('mock-server');
    expect(state.activeTabUid).toBe(MOCK_SERVER_UID);
  });

  it('restoreTabs skips duplicate mock-server snapshots for the same mockServerUid', () => {
    const collection = makeCollection();
    const snapshotTabs = [
      { type: 'mock-server', mockServerUid: MOCK_SERVER_UID, name: 'Dog API', permanent: true },
      { type: 'mock-server', mockServerUid: MOCK_SERVER_UID, name: 'Dog API copy', permanent: true }
    ];

    const state = reducer(undefined, restoreTabs({
      collection,
      tabs: snapshotTabs,
      activeTab: { accessor: 'type::mockServerUid', value: MOCK_SERVER_UID }
    }));

    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].mockServerUid).toBe(MOCK_SERVER_UID);
    expect(state.activeTabUid).toBe(MOCK_SERVER_UID);
  });
});
