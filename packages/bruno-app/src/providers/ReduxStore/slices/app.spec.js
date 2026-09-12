import reducer, { updatePreferences, setSidebarCollapsed, setTabBarCollapsed, updateTabBarWidth } from './app';

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

  it('sets sidebar collapse state explicitly', () => {
    const state = reducer(undefined, setSidebarCollapsed(true));

    expect(state.sidebarCollapsed).toBe(true);
  });

  it('sets tab bar collapse state and width explicitly', () => {
    const collapsed = reducer(undefined, setTabBarCollapsed(true));
    const state = reducer(collapsed, updateTabBarWidth({ tabBarWidth: 320 }));

    expect(state.tabBarCollapsed).toBe(true);
    expect(state.tabBarWidth).toBe(320);
  });
});
