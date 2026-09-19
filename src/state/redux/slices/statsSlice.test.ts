import reducer, { setServerAlbumStats, setServerSongStats } from './statsSlice';

/**
 * What the server says about plays.
 *
 * The local tally this slice used to carry alongside is gone — it lived in
 * `incrementPlay`, was a parallel record of what `listeningSlice` writes from
 * the same call site, and could not see a skip because only a scrobble ever
 * triggered it. Its tests moved with it to `listeningSlice.test.ts`, and the
 * "drop the local tally once the server has counted it" reconciliation went
 * too: there is nothing local left here to reconcile, and a log is not an
 * optimistic overlay that can be deleted once confirmed.
 *
 * What remains is the part only a server can answer, and the one rule that has
 * bitten: a sync *replaces* that server's set rather than merging into it.
 */
const empty = () => reducer(undefined, { type: '@@init' });

describe('setServerSongStats', () => {
  it('records what the server reported', () => {
    const state = reducer(empty(), setServerSongStats({
      serverId: 'srv',
      stats: [{ id: 's1', playCount: 12, lastPlayedAt: 1_700_000_000 }],
    }));
    expect(state.serverSongPlays['srv:s1']).toBe(12);
    expect(state.serverSongLastPlayedAt['srv:s1']).toBe(1_700_000_000);
  });

  /**
   * Merging would keep a count for a song whose plays went back to zero, or
   * that left the library entirely — so the map grew without bound across
   * library churn and showed numbers the server no longer held.
   */
  it('replaces the server set rather than merging, so a stale count cannot linger', () => {
    let state = reducer(empty(), setServerSongStats({
      serverId: 'srv',
      stats: [{ id: 's1', playCount: 5 }, { id: 's2', playCount: 9 }],
    }));
    state = reducer(state, setServerSongStats({
      serverId: 'srv',
      stats: [{ id: 's2', playCount: 9 }],
    }));

    expect(state.serverSongPlays['srv:s1']).toBeUndefined();
    expect(state.serverSongPlays['srv:s2']).toBe(9);
  });

  it('replaces only the syncing server, leaving another server untouched', () => {
    let state = reducer(empty(), setServerSongStats({
      serverId: 'other',
      stats: [{ id: 's1', playCount: 3 }],
    }));
    state = reducer(state, setServerSongStats({ serverId: 'srv', stats: [] }));

    expect(state.serverSongPlays['other:s1']).toBe(3);
  });

  it('leaves a last-played the server did not give', () => {
    const state = reducer(empty(), setServerSongStats({
      serverId: 'srv',
      stats: [{ id: 's1', playCount: 4 }],
    }));
    expect(state.serverSongLastPlayedAt['srv:s1']).toBeUndefined();
  });
});

describe('setServerAlbumStats', () => {
  it('records what the server reported', () => {
    const state = reducer(empty(), setServerAlbumStats({
      serverId: 'srv',
      stats: [{ id: 'a1', playCount: 7, lastPlayedAt: 1_700_000_000 }],
    }));
    expect(state.serverAlbumPlays['srv:a1']).toBe(7);
    expect(state.serverAlbumLastPlayedAt['srv:a1']).toBe(1_700_000_000);
  });

  it('treats a zero timestamp as no timestamp', () => {
    const state = reducer(empty(), setServerAlbumStats({
      serverId: 'srv',
      stats: [{ id: 'a1', playCount: 7, lastPlayedAt: 0 }],
    }));
    expect(state.serverAlbumLastPlayedAt['srv:a1']).toBeUndefined();
  });

  it('replaces the server set rather than merging', () => {
    let state = reducer(empty(), setServerAlbumStats({
      serverId: 'srv',
      stats: [{ id: 'a1', playCount: 2, lastPlayedAt: 0 }],
    }));
    state = reducer(state, setServerAlbumStats({ serverId: 'srv', stats: [] }));

    expect(state.serverAlbumPlays['srv:a1']).toBeUndefined();
  });
});
