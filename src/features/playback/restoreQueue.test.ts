import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';

import { buildRestoredQueue, decideRestore } from './restoreQueue';

const provenance = serverProvenance('srv-1');
const localIdOf = (nativeId: string) => makeLocalId('song', provenance, nativeId);

function song(nativeId: string): Song {
  return {
    localId: localIdOf(nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: `Track ${nativeId}`,
    artist: { localId: makeLocalId('artist', provenance, 'a'), nativeId: 'a', externalIds: {}, name: 'Movements', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', provenance, 'al'), nativeId: 'al', externalIds: {}, title: 'Al', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds: 201,
    contentKind: 'song',
    genres: [],
  };
}

/** What the app actually does: build a fresh stream URL for the song. */
const resolve = (s: Song): PlayableResource | null => ({ song: s, streamUrl: `https://server.test/stream/${s.nativeId}` });

describe('buildRestoredQueue — where each track was queued from', () => {
  const fromPlaylist = { contextId: 'pl-1', contextType: 'playlist' } as const;

  it('keeps each track’s own context when a song before it has gone missing', () => {
    // 'a' came from the playlist and is gone. Its context has to go with it,
    // not shift onto 'b', which was queued on its own.
    const { queue, contexts } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b'), localIdOf('c')],
      persistedContexts: [fromPlaylist, null, fromPlaylist],
      persistedIndex: 1,
      libraryTracks: [song('b'), song('c')],
      resolve,
    });

    expect(queue.map((r) => r.song.nativeId)).toEqual(['b', 'c']);
    expect(contexts).toEqual([null, fromPlaylist]);
  });

  it('restores a queue saved before contexts were recorded as ad hoc', () => {
    const { contexts } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b')],
      persistedContexts: [],
      persistedIndex: 0,
      libraryTracks: [song('a'), song('b')],
      resolve,
    });

    expect(contexts).toEqual([null, null]);
  });
});

describe('buildRestoredQueue', () => {
  it('gives every restored song a playable URL', () => {
    // The library copy carries no URL — ids are all that is persisted, and the
    // library rows are metadata. Handing these on unresolved is what made a
    // restored queue unplayable: the loader asserts its input is playable,
    // threw, and the throw was swallowed by a floating promise. The app showed
    // the queue and play did nothing.
    const library = [song('a'), song('b')];

    const { queue } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b')],
      persistedIndex: 0,
      libraryTracks: library,
      resolve,
    });

    expect(queue).toHaveLength(2);
    expect(queue.every((r) => Boolean(r.streamUrl))).toBe(true);
  });

  it('drops a song it cannot make playable rather than losing the queue', () => {
    const library = [song('a'), song('b')];
    const resolveOnlyA = (s: Song): PlayableResource | null =>
      s.nativeId === 'a' ? { song: s, streamUrl: 'https://server.test/stream/a' } : null;

    const { queue } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b')],
      persistedIndex: 0,
      libraryTracks: library,
      resolve: resolveOnlyA,
    });

    expect(queue.map((r) => r.song.nativeId)).toEqual(['a']);
  });

  it('follows the remembered song when an earlier one has gone missing', () => {
    // 'a' is no longer in the library, so everything shifts up one. The index
    // has to follow the song, not the slot.
    const library = [song('b'), song('c')];

    const { queue, index } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b'), localIdOf('c')],
      persistedIndex: 2, // 'c'
      libraryTracks: library,
      resolve,
    });

    expect(queue.map((r) => r.song.nativeId)).toEqual(['b', 'c']);
    expect(queue[index].song.nativeId).toBe('c');
  });

  it('falls back positionally when the remembered song is the missing one', () => {
    const library = [song('a'), song('c')];

    const { queue, index } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b'), localIdOf('c')],
      persistedIndex: 1, // 'b', which is gone
      libraryTracks: library,
      resolve,
    });

    expect(queue.map((r) => r.song.nativeId)).toEqual(['a', 'c']);
    expect(index).toBe(1);
  });

  it('returns nothing when the library has none of the remembered songs', () => {
    const { queue, index } = buildRestoredQueue({
      persistedIds: [localIdOf('a'), localIdOf('b')],
      persistedIndex: 1,
      libraryTracks: [],
      resolve,
    });

    expect(queue).toEqual([]);
    expect(index).toBe(0);
  });

  it('keeps the index inside the queue when it points past the end', () => {
    const { queue, index } = buildRestoredQueue({
      persistedIds: [localIdOf('a')],
      persistedIndex: 9,
      libraryTracks: [song('a')],
      resolve,
    });

    expect(index).toBeLessThan(queue.length);
  });
});

describe('decideRestore', () => {
  const ready = {
    activeServerId: 'srv-1',
    persistedCount: 3,
    persistedServerId: 'srv-1',
    queueLoaded: false,
    libraryHydrated: true,
  };

  it('restores when a persisted queue belongs to the active server and nothing is playing', () => {
    expect(decideRestore(ready)).toEqual({ kind: 'restore' });
  });

  it('says nothing when there was nothing to restore', () => {
    // Most launches: no server yet, or no queue from last time. Neither is a
    // queue that went missing, so neither is worth a log line.
    expect(decideRestore({ ...ready, activeServerId: null })).toMatchObject({ kind: 'skip', report: false, final: false });
    expect(decideRestore({ ...ready, persistedCount: 0 })).toMatchObject({ kind: 'skip', report: false, final: false });
  });

  it('ends the attempt once the listener has started a queue of their own', () => {
    // This was retried on every state change: starting a track logged "a queue
    // is already loaded" once per persisted write, and a restore that finally
    // got through would have replaced what the listener chose.
    expect(decideRestore({ ...ready, queueLoaded: true })).toEqual({
      kind: 'skip', reason: 'a queue is already loaded', final: true, report: true,
    });
  });

  it('keeps waiting for the library, and says why', () => {
    const decision = decideRestore({ ...ready, libraryHydrated: false });
    expect(decision).toEqual({ kind: 'skip', reason: 'library not hydrated yet', final: false, report: true });
    // Hydration landing is exactly what should let it through.
    expect(decideRestore({ ...ready, libraryHydrated: true })).toEqual({ kind: 'restore' });
  });

  it('does not restore another server’s queue, but can once that server is active again', () => {
    expect(decideRestore({ ...ready, activeServerId: 'srv-2' })).toEqual({
      kind: 'skip', reason: 'queue belongs to another server (srv-1)', final: false, report: true,
    });
  });

  it('prefers the server mismatch over a loaded queue, which is not what stopped it', () => {
    expect(decideRestore({ ...ready, activeServerId: 'srv-2', queueLoaded: true })).toMatchObject({
      reason: 'queue belongs to another server (srv-1)',
    });
  });
});
