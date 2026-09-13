import type { PlayerBackend } from '@/features/player/backend';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import type { ShuffleMode } from '@/domain/playback/PlaybackModes';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { segmentAt, type QueueSegment } from './playingQueue';
import {
  createPlaybackStarters,
  type PlaybackStarterDeps,
  type StartableCollection,
} from './playbackStarters';

jest.mock('@/utils/shuffleArray', () => ({
  // Reversed rather than randomised: a test can then tell "was shuffled" from
  // "was left alone" without pinning a random order.
  __esModule: true,
  default: <T,>(items: T[]) => [...items].reverse(),
}));

const provenance = serverProvenance('srv-1');

function song(nativeId: string): Song {
  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: `Track ${nativeId}`,
    artist: {
      localId: makeLocalId('artist', provenance, 'a1'),
      nativeId: 'a1',
      externalIds: {},
      name: 'Artist',
      cover: { kind: 'none' },
    },
    album: {
      localId: makeLocalId('album', provenance, 'al1'),
      nativeId: 'al1',
      externalIds: {},
      title: 'Album',
      cover: { kind: 'none' },
    },
    cover: { kind: 'none' },
    durationSeconds: 200,
    contentKind: 'song',
    genres: [],
  };
}

const resource = (nativeId: string): PlayableResource => ({
  song: song(nativeId),
  streamUrl: `https://server.test/stream/${nativeId}`,
});

const album = (nativeIds: string[]): StartableCollection => ({
  songs: nativeIds.map(song),
  contextId: 'album-1',
  contextType: 'album',
});

function harness(over: Partial<{
  queue: PlayableResource[];
  segments: QueueSegment[];
  unplayable: string[];
}> = {}) {
  let queue = over.queue ?? [];
  let segments = over.segments ?? [];
  let shuffleMode: ShuffleMode = 'off';
  let originalQueue: PlayableResource[] | null = null;
  const active: { index: number; id: string }[] = [];
  const loaded: { ids: string[]; startIndex: number }[] = [];
  const engineCalls: { name: string; args: unknown[] }[] = [];

  const backend = {
    addMediaItems: (items: { mediaId?: string }[]) => {
      engineCalls.push({ name: 'addMediaItems', args: [items.map(i => i.mediaId)] });
    },
  } as unknown as PlayerBackend;

  const deps: PlaybackStarterDeps = {
    backend: () => backend,
    queue: () => queue,
    setQueue: next => { queue = next; },
    segments: () => segments,
    setSegments: next => { segments = next; },
    setActive: (index, r) => { active.push({ index, id: r.song.nativeId }); },
    setShuffleMode: mode => { shuffleMode = mode; },
    setOriginalQueue: resources => { originalQueue = resources; },
    resolvePlayableSong: s => (
      (over.unplayable ?? []).includes(s.nativeId)
        ? null
        : { song: s, streamUrl: `https://server.test/stream/${s.nativeId}` }
    ),
    toMediaItems: resources => resources.map(r => ({ mediaId: r.song.localId, url: r.streamUrl })),
    bumpQueue: () => {},
    loadQueue: async (resources, startIndex) => {
      loaded.push({ ids: resources.map(r => r.song.nativeId), startIndex });
    },
    now: () => 1_700_000_000_000,
  };

  return {
    starters: createPlaybackStarters(deps),
    active,
    loaded,
    engineCalls,
    get queue() { return queue; },
    get segments() { return segments; },
    get shuffleMode() { return shuffleMode; },
    get originalQueue() { return originalQueue; },
  };
}

const ids = (queue: PlayableResource[]) => queue.map(r => r.song.nativeId);

describe('playSong', () => {
  it('makes the track its own queue of one and plays it', async () => {
    const h = harness({ queue: [resource('9')] });

    await h.starters.playSong(song('1'));

    expect(ids(h.queue)).toEqual(['1']);
    expect(h.active).toEqual([{ index: 0, id: '1' }]);
    expect(h.loaded).toEqual([{ ids: ['1'], startIndex: 0 }]);
  });

  it('clears the shuffle snapshot, which belonged to a queue that is gone', async () => {
    // A stale snapshot restored later is a queue from two selections ago.
    const h = harness();

    await h.starters.playSong(song('1'));

    expect(h.originalQueue).toBeNull();
    expect(h.shuffleMode).toBe('off');
  });

  it('throws for a track with no playable URL rather than clearing the queue', async () => {
    const h = harness({ queue: [resource('9')], unplayable: ['1'] });

    await expect(h.starters.playSong(song('1'))).rejects.toThrow(/no playable media URL/);
    expect(ids(h.queue)).toEqual(['9']);
  });
});

describe('playSongs', () => {
  it('plays the selection from the chosen index', async () => {
    const h = harness();

    await h.starters.playSongs([song('1'), song('2'), song('3')], { startIndex: 1 });

    expect(h.loaded).toEqual([{ ids: ['1', '2', '3'], startIndex: 1 }]);
  });

  it('drops tracks with no playable URL instead of failing the lot', async () => {
    const h = harness({ unplayable: ['2'] });

    await h.starters.playSongs([song('1'), song('2'), song('3')]);

    expect(ids(h.queue)).toEqual(['1', '3']);
  });

  it('throws when nothing in the selection can be played', async () => {
    const h = harness({ unplayable: ['1', '2'] });

    await expect(h.starters.playSongs([song('1'), song('2')]))
      .rejects.toThrow('No playable tracks in selection');
  });

  it('snapshots the order the listener chose, before the shuffle', async () => {
    // This is what turning shuffle off restores. Snapshotting after the
    // shuffle would restore an order nobody picked.
    const h = harness();

    await h.starters.playSongs([song('1'), song('2'), song('3')], { shuffle: true });

    expect(ids(h.originalQueue ?? [])).toEqual(['1', '2', '3']);
    expect(ids(h.queue)).toEqual(['3', '2', '1']);
    expect(h.shuffleMode).toBe('shuffle');
  });

  it('starts a shuffled selection at the top, wherever it was tapped', async () => {
    const h = harness();

    await h.starters.playSongs([song('1'), song('2'), song('3')], { startIndex: 2, shuffle: true });

    expect(h.loaded[0].startIndex).toBe(0);
  });

  it('names the context, so the queue knows where it came from', async () => {
    const h = harness();

    await h.starters.playSongs([song('1')], { contextId: 'genre-jazz' });

    expect(segmentAt(h.segments, 0)?.source).toMatchObject({ contextId: 'genre-jazz' });
  });

  it('generates a context id when none is given', async () => {
    const h = harness();

    await h.starters.playSongs([song('1')]);

    expect(segmentAt(h.segments, 0)?.source).toMatchObject({ contextId: 'adhoc-1700000000000' });
  });
});

describe('playCollection', () => {
  it('starts at the track the listener tapped', async () => {
    const h = harness();

    await h.starters.playCollection(song('2'), album(['1', '2', '3']));

    expect(h.loaded).toEqual([{ ids: ['1', '2', '3'], startIndex: 1 }]);
  });

  it('records the album as the context of the whole queue', async () => {
    const h = harness();

    await h.starters.playCollection(song('2'), album(['1', '2', '3']));

    expect(h.segments).toEqual([{
      startIndex: 0,
      length: 3,
      source: { kind: 'user', contextId: 'album-1', contextType: 'album' },
    }]);
  });

  it('shuffles the album rather than starting at the tapped track', async () => {
    // Shuffling an album from a track means shuffling the album; honouring
    // the tap as a starting point would defeat the shuffle.
    const h = harness();

    await h.starters.playCollection(song('2'), album(['1', '2', '3']), true);

    expect(h.loaded[0].startIndex).toBe(0);
    expect(ids(h.originalQueue ?? [])).toEqual(['1', '2', '3']);
  });

  it('starts at the top when the tapped track is not in the collection', async () => {
    const h = harness();

    await h.starters.playCollection(song('99'), album(['1', '2', '3']));

    expect(h.loaded[0].startIndex).toBe(0);
  });

  it('refuses an unplayable selection without replacing the queue first', async () => {
    // Checked before anything changes: failing half-way would leave the
    // listener with a queue they did not ask for and no music.
    const h = harness({ queue: [resource('9')], unplayable: ['2'] });

    await expect(h.starters.playCollection(song('2'), album(['1', '2', '3'])))
      .rejects.toThrow(/no playable media URL/);
    expect(ids(h.queue)).toEqual(['9']);
  });

  it('throws when the collection has nothing playable in it', async () => {
    const h = harness({ unplayable: ['1', '2'] });

    await expect(h.starters.playCollection(song('1'), album(['1', '2'])))
      .rejects.toThrow(/Collection has no playable media URLs: album-1/);
  });
});

describe('appendCollection', () => {
  it('adds to the queue and the player without disturbing what is playing', async () => {
    const h = harness({ queue: [resource('9')] });

    h.starters.appendCollection(album(['1', '2']), false);

    expect(ids(h.queue)).toEqual(['9', '1', '2']);
    expect(h.loaded).toEqual([]);
    expect(h.active).toEqual([]);
    expect(h.engineCalls).toHaveLength(1);
  });

  it('shuffles the added stretch when asked, leaving the queue before it alone', () => {
    const h = harness({ queue: [resource('9')] });

    h.starters.appendCollection(album(['1', '2', '3']), true);

    expect(ids(h.queue)).toEqual(['9', '3', '2', '1']);
  });

  it('skips tracks the queue already holds rather than duplicating them', () => {
    // Adding an album twice should not give the listener two of every song.
    const h = harness({ queue: [resource('1')] });

    h.starters.appendCollection(album(['1', '2']), false);

    expect(ids(h.queue)).toEqual(['1', '2']);
  });

  it('does nothing at all when every track is already queued', () => {
    const h = harness({ queue: [resource('1'), resource('2')] });

    h.starters.appendCollection(album(['1', '2']), false);

    expect(ids(h.queue)).toEqual(['1', '2']);
    expect(h.engineCalls).toEqual([]);
  });

  it('tags the added stretch with the collection it came from', () => {
    const h = harness({ queue: [resource('9')] });

    h.starters.appendCollection(album(['1', '2']), false);

    expect(segmentAt(h.segments, 1)?.source).toMatchObject({
      contextId: 'album-1',
      contextType: 'album',
    });
  });
});
