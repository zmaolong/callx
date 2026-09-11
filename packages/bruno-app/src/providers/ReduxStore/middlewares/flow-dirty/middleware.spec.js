/**
 * flowDirtyMiddleware 测试
 *
 * 覆盖：基准建立、编辑标脏、保存清脏、树重建的脏保护与干净对齐。
 */
import collectionsReducer from 'providers/ReduxStore/slices/collections';
import flowEditorReducer from 'providers/ReduxStore/slices/flowEditor';
import { flowDirtyMiddleware } from 'providers/ReduxStore/middlewares/flow-dirty/middleware';
import { discardFlowRecord } from 'utils/flow/dirty-registry';

const FLOW_UID = 'flow1';
const COL_UID = 'col1';

const makeFlowItem = (flow) => ({
  uid: FLOW_UID,
  type: 'flow',
  name: 'test-flow',
  flow,
  items: []
});

const makeGraph = (extraNodes = [], edges = []) => ({
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 } },
    { id: 'end', type: 'end', position: { x: 100, y: 0 } },
    ...extraNodes
  ],
  edges
});

const makeStore = () => {
  let state = {
    collections: { collections: [] },
    flowEditor: flowEditorReducer(undefined, { type: '@@init' })
  };
  const rawDispatch = (action) => {
    if (typeof action === 'function') return; // thunk 不在此测试范围
    if (action.type?.startsWith('flowEditor/')) {
      state.flowEditor = flowEditorReducer(state.flowEditor, action);
    } else {
      state.collections = collectionsReducer(state.collections, action);
    }
    return action;
  };
  const getState = () => state;
  const next = rawDispatch;
  const dispatch = (action) => {
    // 中间件派生的 flowEditor action 走 rawDispatch，避免再次进入被测中间件
    rawDispatch(action);
    return action;
  };
  const run = (action) => flowDirtyMiddleware({ getState, dispatch })(next)(action);
  return { getState, run, rawDispatch };
};

const createCollection = (run, flow) => {
  run({
    type: 'collections/createCollection',
    payload: {
      uid: COL_UID,
      name: 'test',
      items: [makeFlowItem(flow)],
      brunoConfig: {}
    }
  });
};

const loadTree = (run, flow) => {
  run({
    type: 'collections/collectionLoadedFromTree',
    payload: {
      collectionUid: COL_UID,
      tree: { items: [makeFlowItem(flow)], environments: [] }
    }
  });
};

const dirtyOf = (store) => store.getState().flowEditor.dirtyByUid[FLOW_UID] === true;

beforeEach(() => {
  discardFlowRecord(FLOW_UID);
});

describe('flowDirtyMiddleware', () => {
  it('集合装载时应建立基准，之后图编辑标脏', () => {
    const store = makeStore();
    createCollection(store.run, makeGraph());
    expect(dirtyOf(store)).toBe(false);

    store.run({
      type: 'collections/updateFlowNode',
      payload: { collectionUid: COL_UID, itemUid: FLOW_UID, nodeId: 'start', updates: {} }
    });
    expect(dirtyOf(store)).toBe(true);
  });

  it('保存成功后应重建基准并清脏', () => {
    const store = makeStore();
    createCollection(store.run, makeGraph());

    store.run({
      type: 'collections/addFlowNode',
      payload: {
        collectionUid: COL_UID,
        itemUid: FLOW_UID,
        node: { id: 'step_a', type: 'request' }
      }
    });
    expect(dirtyOf(store)).toBe(true);

    store.run({
      type: 'flowEditor/flowSaved',
      payload: { flowUid: FLOW_UID, collectionUid: COL_UID }
    });
    expect(dirtyOf(store)).toBe(false);

    // 再次树重建：干净状态对齐磁盘，不应提示外部变更
    loadTree(store.run, makeGraph([{ id: 'step_a', type: 'request' }]));
    expect(store.getState().flowEditor.externalChangeByUid[FLOW_UID]).toBeUndefined();
    expect(dirtyOf(store)).toBe(false);
  });

  it('树重建不得覆盖脏图，并给出外部变更提示', () => {
    const store = makeStore();
    createCollection(store.run, makeGraph());

    store.run({
      type: 'collections/addFlowNode',
      payload: {
        collectionUid: COL_UID,
        itemUid: FLOW_UID,
        node: { id: 'step_a', type: 'request' }
      }
    });
    expect(dirtyOf(store)).toBe(true);

    // 磁盘版本没有 step_a
    loadTree(store.run, makeGraph());

    const state = store.getState();
    expect(state.flowEditor.externalChangeByUid[FLOW_UID]).toBe(true);
    // 内存图保留 step_a
    const collection = state.collections.collections.find((c) => c.uid === COL_UID);
    const flowItem = collection.items.find((i) => i.uid === FLOW_UID);
    expect(flowItem.flow.nodes.some((n) => n.id === 'step_a')).toBe(true);
    // 脏标记保持
    expect(dirtyOf(store)).toBe(true);
  });

  it('干净状态下树重建应对齐磁盘版本', () => {
    const store = makeStore();
    createCollection(store.run, makeGraph());

    // 磁盘版本多了 step_a
    loadTree(store.run, makeGraph([{ id: 'step_a', type: 'request' }]));

    const collection = store.getState().collections.collections.find((c) => c.uid === COL_UID);
    const flowItem = collection.items.find((i) => i.uid === FLOW_UID);
    expect(flowItem.flow.nodes.some((n) => n.id === 'step_a')).toBe(true);
    expect(dirtyOf(store)).toBe(false);
  });
});
