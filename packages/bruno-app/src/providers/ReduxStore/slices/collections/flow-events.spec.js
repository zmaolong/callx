import path from 'utils/common/path';
import { collectionsSlice } from './index';

const {
  collectionAddDirectoryEvent,
  collectionAddFileEvent,
  collectionChangeFileEvent
} = collectionsSlice.actions;
const reducer = collectionsSlice.reducer;

const collectionPath = 'C:\\collections\\flow-coll';
const flowDirectory = path.join(collectionPath, 'loop-flow');
const flowPath = path.join(flowDirectory, 'flow.yml');
const requestPath = path.join(flowDirectory, 'loop-body.yml');

const flowData = {
  uid: 'parsed-flow-uid',
  type: 'flow',
  name: 'loop-flow',
  seq: 1,
  flow: {
    nodes: [{ id: 'start', type: 'start' }],
    edges: []
  }
};

const requestData = {
  uid: 'request-uid',
  name: 'loop-body',
  type: 'http-request',
  seq: 1,
  request: { method: 'GET', url: 'http://localhost:8081/body' }
};

const makeState = () => ({
  collections: [{ uid: 'col1', pathname: collectionPath, items: [] }]
});

const addDirectory = (state, pathname = flowDirectory) => reducer(
  state,
  collectionAddDirectoryEvent({
    dir: {
      meta: {
        collectionUid: 'col1',
        pathname,
        name: path.basename(pathname),
        uid: 'directory-uid'
      }
    }
  })
);

const addFlowFile = (state) => reducer(
  state,
  collectionAddFileEvent({
    file: {
      meta: { collectionUid: 'col1', pathname: flowPath, name: 'flow.yml', folderRoot: true },
      data: flowData
    }
  })
);

const changeFlowFile = (state) => reducer(
  state,
  collectionChangeFileEvent({
    file: {
      meta: { collectionUid: 'col1', pathname: flowPath, name: 'flow.yml', folderRoot: true },
      data: flowData
    }
  })
);

const addRequestFile = (state) => reducer(
  state,
  collectionAddFileEvent({
    file: {
      meta: { collectionUid: 'col1', pathname: requestPath, name: 'loop-body.yml' },
      data: requestData,
      partial: false,
      loading: false
    }
  })
);

const getFlow = (state) => state.collections[0].items.find((item) => item.pathname === flowDirectory);

describe('Flow 增量文件事件', () => {
  it('flow.yml 先到、addDir 后到时保留 Flow 类型和图数据', () => {
    let state = addFlowFile(makeState());
    state = addDirectory(state);

    const flow = getFlow(state);
    expect(state.collections[0].items).toHaveLength(1);
    expect(flow).toMatchObject({ type: 'flow', name: 'loop-flow', flow: flowData.flow });
  });

  it('addDir 先到、flow.yml 后到时升级已有目录为 Flow', () => {
    let state = addDirectory(makeState());
    state = addFlowFile(state);

    const flow = getFlow(state);
    expect(state.collections[0].items).toHaveLength(1);
    expect(flow).toMatchObject({ type: 'flow', flow: flowData.flow });
    expect(flow.uid).toBe('directory-uid');
  });

  it('flow.yml change 先到时也会创建并恢复 Flow', () => {
    const state = changeFlowFile(makeState());

    expect(getFlow(state)).toMatchObject({ type: 'flow', flow: flowData.flow });
  });

  it('普通请求文件先到不会阻止后续 flow.yml 升级目录', () => {
    let state = addRequestFile(makeState());
    state = addFlowFile(state);
    state = addDirectory(state);

    const flow = getFlow(state);
    expect(state.collections[0].items).toHaveLength(1);
    expect(flow).toMatchObject({ type: 'flow', flow: flowData.flow });
    expect(flow.items).toHaveLength(1);
    expect(flow.items[0].name).toBe('loop-body');
  });

  it('普通 addDir 仍保持 folder 类型', () => {
    const state = addDirectory(makeState(), path.join(collectionPath, 'ordinary-folder'));
    const folder = state.collections[0].items[0];

    expect(folder.type).toBe('folder');
    expect(folder.flow).toBeUndefined();
  });
});
