import { makeTabPermanent } from 'providers/ReduxStore/slices/tabs';
import { findCollectionByUid, findItemInCollection } from 'utils/collections/index';
import find from 'lodash/find';

function handleMakeTabParmanent(state, action, dispatch) {
  const tabs = state.tabs.tabs;
  const activeTabUid = state.tabs.activeTabUid;
  const focusedTab = find(tabs, (t) => t.uid === activeTabUid);

  if (!focusedTab || focusedTab.preview !== true) {
    return;
  }

  const { itemUid, folderUid, collectionUid } = action.payload || {};
  const collection = findCollectionByUid(state.collections.collections, collectionUid);

  if (!collection) {
    return;
  }

  const resourceUid = itemUid || folderUid || collectionUid;
  const resource = itemUid || folderUid
    ? findItemInCollection(collection, resourceUid)
    : collection;

  if (!resource) {
    return;
  }

  // 只有事件属于当前预览 Tab 时才将其永久化，避免后台请求或其他 Tab 的事件误作用于当前 Tab。
  const isSameResource = focusedTab.collectionUid === collectionUid && (
    focusedTab.uid === resourceUid
    || (resource.pathname && focusedTab.type !== 'response-example' && focusedTab.pathname === resource.pathname)
  );
  if (!isSameResource) {
    return;
  }

  dispatch(makeTabPermanent({ uid: focusedTab.uid }));
}

export {
  handleMakeTabParmanent
};
