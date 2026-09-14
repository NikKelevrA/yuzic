import type { PlayerBackend } from '@/features/player/backend';
import type { MediaItem } from '@/features/player/mediaItem';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { Song } from '@/domain/entities/Song';
import type { ContentKind } from '@/domain/playback/ContentKind';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { createPlaybackCoordinator, type PlaybackCoordinatorDeps } from './playbackCoordinator';

const provenance = serverProvenance('srv-1');

function song(nativeId: string, contentKind: ContentKind = 'song'): Song {
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
    contentKind,
    genres: [],
  };
}

const resource = (nativeId: string, contentKind: ContentKind = 'song'): PlayableResource => ({
  song: song(nativeId, contentKind),
  streamUrl: `https://server.test/stream/${nativeId}`,
});

const itemFor = (nativeId: string): MediaItem => ({
  mediaId: makeLocalId('song', provenance, nativeId),
  title: `Track ${nativeId}`,
  url: `https://server.test/stream/${nativeId}`,
});

function harness(over: Partial<{
  queue: PlayableResource[];
  current: PlayableResource | null;
  library: Map<string, PlayableResource>;
  nativeIndex: number | null;
  nativeQueue: MediaItem[];
  position: number;
  /** Where the track the player just left had got to. Defaults to `position`. */
  outgoingPosition: number;
  resumeAt: number | null;
  speed: number;
  currentSpeed: number;
  autoplayEnabled: boolean;
  filling: boolean;
}> = {}) {
  let queue = over.queue ?? [resource('1'), resource('2')];
  let current = over.current === undefined ? queue[0] : over.current;

  /** One ordered log, because the order these happen in is the thing under test. */
  const events: string[] = [];
  const active: { index: number; id: string }[] = [];
  const persisted: number[] = [];
  const nowPlaying: string[] = [];
  const synced: { nativeId: string; positionMs: number; length: number }[] = [];
  const speeds: number[] = [];
  let fills = 0;

  const backend = {
    getProgress: () => ({ position: over.position ?? 0, duration: 200, buffered: 0 }),
    getOutgoingProgress: () => ({ position: over.outgoingPosition ?? over.position ?? 0, duration: 200, buffered: 0 }),
    getQueue: () => over.nativeQueue ?? queue.map(r => itemFor(r.song.nativeId)),
    getActiveMediaItemIndex: () => (over.nativeIndex === undefined ? 0 : over.nativeIndex),
    seekTo: (s: number) => { events.push(`seekTo:${s}`); },
  } as unknown as PlayerBackend;

  const deps: PlaybackCoordinatorDeps = {
    backend: () => backend,
    queue: () => queue,
    setQueue: next => { queue = next; events.push(`setQueue:${next.length}`); },
    currentResource: () => current,
    setActive: (index, r) => {
      current = r;
      active.push({ index, id: r.song.nativeId });
      events.push(`setActive:${index}:${r.song.nativeId}`);
    },
    library: () => over.library ?? new Map(),
    bumpQueue: () => {},

    onTrackStarted: () => { events.push('onTrackStarted'); },
    scrobbleOutgoing: (s, seconds) => { events.push(`scrobble:${s.nativeId}:${seconds}`); },
    markNewListen: () => { events.push('markNewListen'); },
    saveBookmark: (s, seconds) => { events.push(`bookmark:${s.nativeId}:${seconds}`); },
    resumePositionFor: () => over.resumeAt ?? null,
    persistCurrentIndex: index => { persisted.push(index); },

    speedFor: () => over.speed ?? 1,
    currentSpeed: () => over.currentSpeed ?? 1,
    setSpeed: speed => { speeds.push(speed); },

    submitNowPlaying: s => { nowPlaying.push(s.nativeId); },
    syncServerQueue: (q, nativeId, positionMs) => {
      synced.push({ nativeId, positionMs, length: q.length });
    },

    autoplayEnabled: () => over.autoplayEnabled ?? false,
    isFilling: () => over.filling ?? false,
    fillQueueIfLow: () => { fills += 1; },
  };

  return {
    coordinator: createPlaybackCoordinator(deps),
    events,
    active,
    persisted,
    nowPlaying,
    synced,
    speeds,
    get queue() { return queue; },
    get fills() { return fills; },
  };
}

describe('nothing to react to', () => {
  it('ignores an absent item', () => {
    const h = harness();

    h.coordinator.onActiveTrackChanged(null);
    h.coordinator.onActiveTrackChanged(undefined);
    h.coordinator.onActiveTrackChanged({ url: 'https://x' } as MediaItem);

    expect(h.events).toEqual([]);
  });
});

describe('leaving the previous track', () => {
  it('files the listen and the resume point before the pointer moves', () => {
    // The ordering constraint that matters most. A moment later the player's
    // position belongs to the track now playing, and both would be filed
    // against the wrong song.
    const h = harness({ nativeIndex: 1, position: 95.7 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    const scrobbleAt = h.events.indexOf('scrobble:1:95');
    const bookmarkAt = h.events.indexOf('bookmark:1:95');
    const activeAt = h.events.findIndex(e => e.startsWith('setActive:'));

    expect(scrobbleAt).toBeGreaterThan(-1);
    expect(scrobbleAt).toBeLessThan(activeAt);
    expect(bookmarkAt).toBeLessThan(activeAt);
  });

  it('files a song that played to its end with its whole length, not the next track\'s zero', () => {
    // How it looks from here when a track finishes on its own: the player has
    // already moved to the next song, so its current position is 0. Reading
    // that filed the finished song as a 0-second listen and it never counted.
    const h = harness({ nativeIndex: 1, position: 0, outgoingPosition: 199.6 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.events).toContain('scrobble:1:199');
    expect(h.events).toContain('bookmark:1:199');
  });

  it('restarts the listen clock for the track now playing', () => {
    const h = harness({ nativeIndex: 1, position: 95 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.events).toContain('markNewListen');
  });

  it('does none of that when the same track is re-reported', () => {
    // Re-reporting the current item is not a track change; scrobbling it
    // would file the same play twice and restarting the clock would stop the
    // play in progress ever reaching the threshold.
    const h = harness({ nativeIndex: 0, position: 95 });

    h.coordinator.onActiveTrackChanged(itemFor('1'));

    expect(h.events).not.toContain('markNewListen');
    expect(h.events.some(e => e.startsWith('scrobble:'))).toBe(false);
    expect(h.events.some(e => e.startsWith('bookmark:'))).toBe(false);
  });

  it('clears the retry state first, because the track is genuinely playing', () => {
    const h = harness({ nativeIndex: 1 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.events[0]).toBe('onTrackStarted');
  });
});

describe('finding the track that started', () => {
  it('trusts the player index over searching the queue', () => {
    // A queue can hold the same track twice, and a search would find the first
    // copy rather than the one being heard.
    const h = harness({
      queue: [resource('1'), resource('2'), resource('1')],
      nativeIndex: 2,
      current: null,
    });

    h.coordinator.onActiveTrackChanged(itemFor('1'));

    expect(h.active).toEqual([{ index: 2, id: '1' }]);
  });

  it('searches the queue when the player cannot say', () => {
    const h = harness({ nativeIndex: -1, current: null });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.active).toEqual([{ index: 1, id: '2' }]);
  });

  it('makes a queue of one for a track no queue contains', () => {
    // Pointing an index at the old queue would select a different song
    // entirely.
    const known = resource('99');
    const h = harness({
      nativeIndex: -1,
      current: null,
      library: new Map([[known.song.localId, known]]),
    });

    h.coordinator.onActiveTrackChanged(itemFor('99'));

    expect(h.queue.map(r => r.song.nativeId)).toEqual(['99']);
    expect(h.active).toEqual([{ index: 0, id: '99' }]);
  });

  it('rebuilds from the player item when nothing knows the track', () => {
    // Reached when a queue survives into a fresh JavaScript context that has
    // lost it: the media id still carries provenance and the origin's id.
    const h = harness({ nativeIndex: -1, current: null, queue: [] });

    h.coordinator.onActiveTrackChanged(itemFor('77'));

    expect(h.active).toEqual([{ index: 0, id: '77' }]);
  });

  it('stops rather than guessing when the item carries no url either', () => {
    const h = harness({ nativeIndex: -1, current: null, queue: [] });

    h.coordinator.onActiveTrackChanged({ mediaId: 'unknown', url: '' });

    expect(h.active).toEqual([]);
  });
});

describe('what follows a track starting', () => {
  it('persists the pointer, not the whole queue', () => {
    const h = harness({ nativeIndex: 1 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.persisted).toEqual([1]);
  });

  it('resumes a bookmarked track from the top of it', () => {
    const h = harness({ nativeIndex: 1, position: 0, resumeAt: 640 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.events).toContain('seekTo:640');
  });

  it('leaves a listener who already scrubbed forward where they are', () => {
    const h = harness({ nativeIndex: 1, position: 30, resumeAt: 640 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.events).not.toContain('seekTo:640');
  });

  it('sets the rate this kind of thing plays at', () => {
    // One global speed meant a podcast at 1.5x carried into the next song.
    const h = harness({ nativeIndex: 1, speed: 1.5, currentSpeed: 1 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.speeds).toEqual([1.5]);
  });

  it('does not touch the rate when it is already right', () => {
    const h = harness({ nativeIndex: 1, speed: 1, currentSpeed: 1 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.speeds).toEqual([]);
  });

  it('syncs the server queue with the native id and milliseconds', () => {
    // This goes to the server, which knows only its own ids.
    const h = harness({ nativeIndex: 1, position: 12.34 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.synced).toEqual([{ nativeId: '2', positionMs: 12340, length: 2 }]);
  });

  it('reports now playing', () => {
    const h = harness({ nativeIndex: 1 });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.nowPlaying).toEqual(['2']);
  });
});

describe('deciding whether to top the queue up', () => {
  it('asks autoplay after the index has settled', () => {
    const h = harness({ nativeIndex: 1, autoplayEnabled: true });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.fills).toBe(1);
  });

  it('does not ask when autoplay is off', () => {
    const h = harness({ nativeIndex: 1, autoplayEnabled: false });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.fills).toBe(0);
  });

  it('does not ask while a fill is already in flight', () => {
    const h = harness({ nativeIndex: 1, autoplayEnabled: true, filling: true });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.fills).toBe(0);
  });

  it('never fills from a radio station', () => {
    // A station is its own infinite feed; there is no seed to compute a
    // follow-up from.
    const h = harness({
      queue: [resource('1'), resource('2', 'liveStream')],
      nativeIndex: 1,
      autoplayEnabled: true,
    });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.fills).toBe(0);
  });

  it('never fills from a podcast, whose next episode is not a similarity call', () => {
    const h = harness({
      queue: [resource('1'), resource('2', 'podcastEpisode')],
      nativeIndex: 1,
      autoplayEnabled: true,
    });

    h.coordinator.onActiveTrackChanged(itemFor('2'));

    expect(h.fills).toBe(0);
  });
});
