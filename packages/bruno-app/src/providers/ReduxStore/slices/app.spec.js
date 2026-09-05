import reducer, { updatePreferences } from './app';

describe('app preferences', () => {
  const initialState = reducer(undefined, { type: 'unknown' });

  it('defaults request tabs to the top position', () => {
    expect(initialState.preferences.general.tabPosition).toBe('top');
  });

  it('preserves the selected request tab position', () => {
    const state = reducer(undefined, updatePreferences({
      ...initialState.preferences,
      general: {
        ...initialState.preferences.general,
        tabPosition: 'right'
      }
    }));

    expect(state.preferences.general.tabPosition).toBe('right');
  });
});
