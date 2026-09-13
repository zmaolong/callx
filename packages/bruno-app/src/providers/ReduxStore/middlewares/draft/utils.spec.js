import { handleMakeTabParmanent } from './utils';

const COLLECTION_UID = 'collection-1';

const createState = ({ activeTabUid, tabs }) => ({
  tabs: {
    activeTabUid,
    tabs
  },
  collections: {
    collections: [{
      uid: COLLECTION_UID,
      pathname: '/collection',
      items: [{
        uid: 'request-1',
        pathname: '/collection/request-1.bru',
        type: 'http-request'
      }]
    }]
  }
});

describe('handleMakeTabParmanent', () => {
  it('makes the active preview tab permanent for its own change event', () => {
    const dispatch = jest.fn();
    const state = createState({
      activeTabUid: 'request-1',
      tabs: [{
        uid: 'request-1',
        collectionUid: COLLECTION_UID,
        pathname: '/collection/request-1.bru',
        preview: true
      }]
    });

    handleMakeTabParmanent(state, {
      payload: { collectionUid: COLLECTION_UID, itemUid: 'request-1' }
    }, dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'tabs/makeTabPermanent',
      payload: { uid: 'request-1' }
    });
  });

  it('ignores a change event belonging to another request tab', () => {
    const dispatch = jest.fn();
    const state = createState({
      activeTabUid: 'request-1',
      tabs: [{
        uid: 'request-1',
        collectionUid: COLLECTION_UID,
        pathname: '/collection/request-1.bru',
        preview: true
      }]
    });

    handleMakeTabParmanent(state, {
      payload: { collectionUid: COLLECTION_UID, itemUid: 'request-2' }
    }, dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses the existing tab uid when a pathname-resolved tab has not synced yet', () => {
    const dispatch = jest.fn();
    const state = createState({
      activeTabUid: 'temporary-tab',
      tabs: [{
        uid: 'temporary-tab',
        collectionUid: COLLECTION_UID,
        pathname: '/collection/request-1.bru',
        preview: true
      }]
    });

    handleMakeTabParmanent(state, {
      payload: { collectionUid: COLLECTION_UID, itemUid: 'request-1' }
    }, dispatch);

    expect(dispatch).toHaveBeenCalledWith({
      type: 'tabs/makeTabPermanent',
      payload: { uid: 'temporary-tab' }
    });
  });

  it('does not make a response-example tab permanent for its request event', () => {
    const dispatch = jest.fn();
    const state = createState({
      activeTabUid: 'example-1',
      tabs: [{
        uid: 'example-1',
        itemUid: 'request-1',
        collectionUid: COLLECTION_UID,
        pathname: '/collection/request-1.bru',
        type: 'response-example',
        preview: true
      }]
    });

    handleMakeTabParmanent(state, {
      payload: { collectionUid: COLLECTION_UID, itemUid: 'request-1' }
    }, dispatch);

    expect(dispatch).not.toHaveBeenCalled();
  });
});
