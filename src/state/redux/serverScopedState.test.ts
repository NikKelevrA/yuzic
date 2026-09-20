import listeningReducer, { recordListen } from './slices/listeningSlice';
import ratingsReducer, { setRatingOverride } from './slices/ratingsSlice';
import { removeServer } from './slices/serversSlice';

/**
 * Removing a server has to take its state with it.
 *
 * Server ids are `nanoid()` at credential save, so removing and re-adding a
 * server — the usual remedy when a connection misbehaves — issues a new id.
 * Anything written under the old one becomes unreachable, because every
 * selector filters on the *active* server's id or prefix, and it is persisted,
 * so it survives restarts and accumulates for the life of the install.
 *
 * These cover the two storage shapes. The other seven slices wire the identical
 * one-line `extraReducers` case and are proved by the same pattern; what is
 * worth testing is that each shape is actually reachable from the action.
 */

const listen = (track: string, at: number) => ({
  at,
  track,
  album: `${track.split(':')[0]}:album`,
  artist: `${track.split(':')[0]}:artist`,
  seconds: 200,
  duration: 200,
  ending: 'finished' as const,
});

describe('removing a server', () => {
  it('takes its listening log and its rollups with it', () => {
    let state = listeningReducer(undefined, recordListen(listen('gone:song1', 1000)));
    state = listeningReducer(state, recordListen(listen('kept:song1', 2000)));

    expect(state.events).toHaveLength(2);
    expect(Object.keys(state.totals)).toHaveLength(2);

    state = listeningReducer(state, removeServer('gone'));

    expect(state.events.map(e => e.track)).toEqual(['kept:song1']);
    expect(Object.keys(state.totals)).toEqual(['kept:song1']);
    // The rollups go with the log. Dropping the events and leaving the totals
    // would look like deletion without being it.
    expect(Object.keys(state.albums)).toEqual(['kept:album']);
    expect(Object.keys(state.artists)).toEqual(['kept:artist']);
  });

  it('leaves another server that happens to share an entity id alone', () => {
    // The key is `serverId:entityId`, so two servers holding a track with the
    // same native id are two rows. A prune that matched on the id rather than
    // the prefix would take both.
    let state = listeningReducer(undefined, recordListen(listen('gone:shared', 1000)));
    state = listeningReducer(state, recordListen(listen('kept:shared', 2000)));

    state = listeningReducer(state, removeServer('gone'));

    expect(Object.keys(state.totals)).toEqual(['kept:shared']);
  });

  it('does not take a server whose id merely starts the same way', () => {
    // `nanoid()` ids are not prefixes of each other in practice, but the prune
    // is a string prefix test and the separator is what makes it exact.
    let state = listeningReducer(undefined, recordListen(listen('ab:song', 1000)));
    state = listeningReducer(state, recordListen(listen('abc:song', 2000)));

    state = listeningReducer(state, removeServer('ab'));

    expect(Object.keys(state.totals)).toEqual(['abc:song']);
  });

  it('takes the rating overrides kept for it', () => {
    let state = ratingsReducer(undefined, setRatingOverride({ serverId: 'gone', nativeId: 's1', rating: 4 }));
    state = ratingsReducer(state, setRatingOverride({ serverId: 'kept', nativeId: 's1', rating: 2 }));

    state = ratingsReducer(state, removeServer('gone'));

    expect(Object.keys(state.byServer)).toEqual(['kept']);
    expect(state.byServer.kept.s1).toBe(2);
  });

  it('leaves everything alone when the removed server had nothing', () => {
    const before = ratingsReducer(undefined, setRatingOverride({ serverId: 'kept', nativeId: 's1', rating: 3 }));

    const after = ratingsReducer(before, removeServer('never-existed'));

    expect(after.byServer).toEqual(before.byServer);
  });
});
