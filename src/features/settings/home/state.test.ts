import reducer, { setHomeShelfVisibility, setHomeShelfLength, selectHomeShelfItemCount, selectHomeShelfVisibilityMap } from './state';

const state = (settingsHome: unknown) => ({ settingsHome } as any);

describe('home settings', () => {
  it('persists shelf visibility and bounded length through reducers/selectors', () => {
    let next = reducer(undefined, setHomeShelfVisibility({ key: 'charts', visible: false }));
    next = reducer(next, setHomeShelfLength('generous'));
    expect(selectHomeShelfVisibilityMap(state(next))).toEqual({ charts: false });
    expect(selectHomeShelfItemCount(state(next))).toBe(14);
  });

  it('starts from the shipped initialState defaults', () => {
    const fresh = state(reducer(undefined, { type: '@@INIT' }));
    expect(selectHomeShelfItemCount(fresh)).toBe(10);
  });
});
