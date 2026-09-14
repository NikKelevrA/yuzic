import reducer, { setHomeShelfVisibility, setHomeShelfLength, setSleepTimerPresets , selectHomeShelfItemCount, selectHomeShelfVisibilityMap, selectSleepTimerPresets } from './state';

const state = (settingsHome: unknown) => ({ settingsHome } as any);

describe('home and sleep settings', () => {
  it('persists shelf visibility and bounded length through reducers/selectors', () => {
    let next = reducer(undefined, setHomeShelfVisibility({ key: 'charts', visible: false }));
    next = reducer(next, setHomeShelfLength('generous'));
    expect(selectHomeShelfVisibilityMap(state(next))).toEqual({ charts: false });
    expect(selectHomeShelfItemCount(state(next))).toBe(14);
  });

  it('starts from the shipped initialState defaults', () => {
    const fresh = state(reducer(undefined, { type: '@@INIT' }));
    expect(selectHomeShelfItemCount(fresh)).toBe(10);
    expect(selectSleepTimerPresets(fresh)).toEqual([5, 15, 30]);
  });

  it('keeps configured sleep presets persisted', () => {
    const next = reducer(undefined, setSleepTimerPresets([10, 45]));
    expect(selectSleepTimerPresets(state(next))).toEqual([10, 45]);
  });
});
