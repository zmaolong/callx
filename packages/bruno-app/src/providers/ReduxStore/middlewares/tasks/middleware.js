import get from 'lodash/get';
import each from 'lodash/each';
import filter from 'lodash/filter';
import { createListenerMiddleware } from '@reduxjs/toolkit';
import { removeTaskFromQueue } from 'providers/ReduxStore/slices/app';
import { addTab, updateTabType } from 'providers/ReduxStore/slices/tabs';
import { collectionAddFileEvent, collectionChangeFileEvent, collectionLoadedFromTree } from 'providers/ReduxStore/slices/collections';
import { findCollectionByUid, findItemInCollectionByPathname, getDefaultRequestPaneTab, findItemInCollectionByItemUid } from 'utils/collections/index';
import { taskTypes } from './utils';

const taskMiddleware = createListenerMiddleware();

const syncFlowTabType = (collectionUid, flowPathname, flowUid, listenerApi) => {
  const state = listenerApi.getState();
  const tabs = state.tabs?.tabs || [];
  const staleTabs = tabs.filter((tab) => (
    tab.collectionUid === collectionUid
    && tab.type === 'folder-settings'
    && (tab.uid === flowUid || tab.pathname === flowPathname)
  ));
  for (const tab of staleTabs) {
    listenerApi.dispatch(updateTabType({ uid: tab.uid, type: 'flow' }));
  }
};

// Flow 根文件可能早于目录事件到达，解析成功后修正旧的 folder-settings Tab。
taskMiddleware.startListening({
  matcher: (action) => (
    action.type === collectionAddFileEvent.type
    || action.type === collectionChangeFileEvent.type
    || action.type === collectionLoadedFromTree.type
  ),
  effect: (action, listenerApi) => {
    if (action.type === collectionLoadedFromTree.type) {
      const collectionUid = action.payload?.collectionUid;
      const flowItems = [];
      const walk = (items = []) => {
        for (const item of items) {
          if (item?.type === 'flow') flowItems.push(item);
          walk(item?.items || []);
        }
      };
      walk(action.payload?.tree?.items || []);
      for (const flow of flowItems) {
        syncFlowTabType(collectionUid, flow.pathname, flow.uid, listenerApi);
      }
      return;
    }

    const file = action.payload?.file;
    if (file?.meta?.folderRoot && file?.data?.type === 'flow') {
      syncFlowTabType(
        file.meta.collectionUid,
        file.meta.pathname ? file.meta.pathname.replace(/[\\/]flow\.(bru|yml|yaml)$/i, '') : null,
        file.data.uid,
        listenerApi
      );
    }
  }
});

/*
 * When a new request is created in the app, a task to open the request is added to the queue.
 * We wait for the File IO to complete, after which the "collectionAddFileEvent" gets dispatched.
 * This middleware listens for the event and checks if there is a task in the queue that matches
 * the collectionUid and itemPathname. If there is a match, we open the request and remove the task
 * from the queue.
 */
taskMiddleware.startListening({
  actionCreator: collectionAddFileEvent,
  effect: (action, listenerApi) => {
    const state = listenerApi.getState();
    const collectionUid = get(action, 'payload.file.meta.collectionUid');

    const openRequestTasks = filter(state.app.taskQueue, { type: taskTypes.OPEN_REQUEST });
    each(openRequestTasks, (task) => {
      if (collectionUid !== task.collectionUid) return;
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      if (!collection || collection.mountStatus !== 'mounted' || collection.isLoading) return;
      const item = findItemInCollectionByPathname(collection, task.itemPathname);
      if (!item) return;
      listenerApi.dispatch(
        addTab({
          uid: item.uid,
          collectionUid: collection.uid,
          type: item.type,
          pathname: item.pathname,
          requestPaneTab: task?.requestPaneTab || getDefaultRequestPaneTab(item),
          preview: task?.preview ?? true,
          ...(item.isTransient ? { isTransient: true } : {})
        })
      );
      listenerApi.dispatch(removeTaskFromQueue({ taskUid: task.uid }));
    });
  }
});

// v2 tree push also acts as a signal for queued OPEN_REQUEST tasks.
taskMiddleware.startListening({
  actionCreator: collectionLoadedFromTree,
  effect: (action, listenerApi) => {
    const state = listenerApi.getState();
    const collectionUid = get(action, 'payload.collectionUid');

    const openRequestTasks = filter(state.app.taskQueue, { type: taskTypes.OPEN_REQUEST });
    each(openRequestTasks, (task) => {
      if (collectionUid !== task.collectionUid) return;
      const collection = findCollectionByUid(state.collections.collections, collectionUid);
      if (!collection || collection.mountStatus !== 'mounted' || collection.isLoading) return;
      const item = findItemInCollectionByPathname(collection, task.itemPathname);
      if (!item) return;
      listenerApi.dispatch(
        addTab({
          uid: item.uid,
          collectionUid: collection.uid,
          type: item.type,
          pathname: item.pathname,
          requestPaneTab: task?.requestPaneTab || getDefaultRequestPaneTab(item),
          preview: task?.preview ?? true,
          ...(item.isTransient ? { isTransient: true } : {})
        })
      );
      listenerApi.dispatch(removeTaskFromQueue({ taskUid: task.uid }));
    });
  }
});

/*
 * When an example is created or cloned, a task to open the example is added to the queue.
 * We wait for the File IO to complete, after which the "collectionChangeFileEvent" gets dispatched.
 * This middleware listens for the event and checks if there is a task in the queue that matches
 * the collectionUid, itemPathname, and exampleIndex. If there is a match, we open the example
 * tab and remove the task from the queue.
 */
taskMiddleware.startListening({
  actionCreator: collectionChangeFileEvent,
  effect: (action, listenerApi) => {
    const state = listenerApi.getState();
    const collectionUid = get(action, 'payload.file.meta.collectionUid');

    const openExampleTasks = filter(state.app.taskQueue, { type: taskTypes.OPEN_EXAMPLE });
    each(openExampleTasks, (task) => {
      if (collectionUid === task.collectionUid) {
        const collection = findCollectionByUid(state.collections.collections, collectionUid);
        if (collection && collection.mountStatus === 'mounted' && !collection.isLoading) {
          const item = findItemInCollectionByItemUid(collection, task.itemUid);
          if (item && item.examples && item.examples.length > task.exampleIndex) {
            const example = item.examples[task.exampleIndex];
            if (example) {
              listenerApi.dispatch(addTab({
                uid: example.uid,
                collectionUid: collection.uid,
                type: 'response-example',
                itemUid: item.uid,
                pathname: item.pathname,
                exampleName: example.name,
                exampleIndex: task.exampleIndex,
                openInEditMode: !!task.openInEditMode
              }));
            }
          }
        }

        listenerApi.dispatch(removeTaskFromQueue({
          taskUid: task.uid
        }));
      }
    });
  }
});

export default taskMiddleware;
