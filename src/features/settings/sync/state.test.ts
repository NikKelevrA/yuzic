import reducer, { selectLastSyncedAt, setLastSyncedAt } from './state';

const rootWith = (settingsSync: ReturnType<typeof reducer>, activeServerId: string | null) => ({
  settingsSync,
  servers: { activeServerId },
});

/**
 * "Last synced" is a fact about one server.
 *
 * It used to be a single timestamp for the whole app, so syncing server A put
 * a newly added server B inside the thirty-minute sync throttle too: B never
 * synced, and its genres (and play stats) never arrived.
 */
describe('settingsSync last synced', () => {
  it('keeps each server\'s sync time separately', () => {
    let state = reducer(undefined, { type: '@@init' });
    state = reducer(state, setLastSyncedAt({ serverId: 'a', at: 1000 }));

    expect(selectLastSyncedAt(rootWith(state, 'a'))).toBe(1000);
    expect(selectLastSyncedAt(rootWith(state, 'b'))).toBeNull();
  });

  it('reads nothing when no server is active', () => {
    const state = reducer(undefined, setLastSyncedAt({ serverId: 'a', at: 1000 }));
    expect(selectLastSyncedAt(rootWith(state, null))).toBeNull();
  });
});
