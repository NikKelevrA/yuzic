/**
 * The two reducer trees list the same slices.
 *
 * `store.ts` builds the tree twice: `_rootReducer` plain, and the persisted one
 * the app actually runs, wrapping each slice in its own `persistReducer`. Two
 * hand-written lists of twenty slices is one list too many — a slice added to
 * one and missed in the other diverges silently.
 *
 * It matters most where it would be least visible. `persistedStateSecrets`
 * asserts that nothing secret reaches storage, and it builds its store from
 * `_rootReducer`; a slice present only in the persisted tree would be written
 * to the device and never looked at by that test.
 */
import store, { _rootReducer } from './store';

const INIT = { type: '@@INIT' };

describe('the store', () => {
  it('persists exactly the slices the plain tree has', () => {
    const plain = Object.keys(_rootReducer(undefined, INIT)).sort();
    const persisted = Object.keys(store.getState()).sort();

    expect(persisted).toEqual(plain);
  });

  it('has slices to compare, so an empty match cannot pass for agreement', () => {
    expect(Object.keys(_rootReducer(undefined, INIT)).length).toBeGreaterThan(10);
  });
});
