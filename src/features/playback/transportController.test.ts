import type { PlayerBackend } from '@/features/player/backend';
import type { PlayableResource } from '@/features/playback/playableResource';
import type { RepeatModeState } from '@/domain/playback/PlaybackModes';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';
import { createTransportController, type TransportDeps } from './transportController';
import { listenedSoFar, observePosition, resetListen, takeFinishedListen } from './listenMeter';

const provenance = serverProvenance('srv-1');

function resource(nativeId: string, durationSeconds = 200): PlayableResource {
  return {
    song: {
      localId: makeLocalId('song', provenance, nativeId),
      nativeId,
      provenance,
      externalIds: {},
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
      durationSeconds,
      contentKind: 'song',
      genres: [],
    },
    streamUrl: `https://server.test/stream/${nativeId}`,
  };
}

interface Harness {
  controller: ReturnType<typeof createTransportController>;
  engineCalls: { name: string; args: unknown[] }[];
  sinkCalls: { name: string; args: unknown[] }[];
  scrobbled: number[];
  active: { index: number; id: string }[];
  newListens: number;
}

function harness(over: Partial<{
  remote: boolean;
  queue: PlayableResource[];
  currentIndex: number;
  repeatMode: RepeatModeState;
  isPlaying: boolean;
  localPosition: number;
  localDuration: number;
  jukeboxPosition: number;
}> = {}): Harness {
  const queue = over.queue ?? [resource('1'), resource('2'), resource('3')];
  const engineCalls: { name: string; args: unknown[] }[] = [];
  const sinkCalls: { name: string; args: unknown[] }[] = [];
  const scrobbled: number[] = [];
  const active: { index: number; id: string }[] = [];
  let newListens = 0;

  const record = (list: typeof engineCalls, name: string) =>
    (...args: unknown[]) => { list.push({ name, args }); };

  const backend = {
    play: record(engineCalls, 'play'),
    pause: record(engineCalls, 'pause'),
    seekTo: record(engineCalls, 'seekTo'),
    skipToNext: record(engineCalls, 'skipToNext'),
    skipToIndex: record(engineCalls, 'skipToIndex'),
    getProgress: () => ({
      position: over.localPosition ?? 0,
      duration: over.localDuration ?? 200,
      buffered: 0,
    }),
  } as unknown as PlayerBackend;

  const deps: TransportDeps = {
    backend: () => backend,
    remoteOwnsPlayback: () => over.remote ?? false,
    sink: {
      pause: async () => { sinkCalls.push({ name: 'pause', args: [] }); },
      resume: async () => { sinkCalls.push({ name: 'resume', args: [] }); },
      seek: async (s: number) => { sinkCalls.push({ name: 'seek', args: [s] }); },
      skipTo: async (i: number) => { sinkCalls.push({ name: 'skipTo', args: [i] }); },
    },
    jukeboxPosition: () => over.jukeboxPosition ?? 0,
    currentResource: () => queue[over.currentIndex ?? 0] ?? null,
    resourceAt: index => queue[index],
    queueLength: () => queue.length,
    currentIndex: () => over.currentIndex ?? 0,
    repeatMode: () => over.repeatMode ?? 'off',
    isPlaying: () => over.isPlaying ?? true,
    scrobbleOutgoing: async seconds => { scrobbled.push(seconds); },
    setActive: (index, r) => { active.push({ index, id: r.song.nativeId }); },
    markNewListen: () => { newListens += 1; },
  };

  return {
    controller: createTransportController(deps),
    engineCalls,
    sinkCalls,
    scrobbled,
    active,
    get newListens() { return newListens; },
  } as Harness;
}

const names = (calls: { name: string }[]) => calls.map(call => call.name);

describe('when this device is playing', () => {
  it('drives the engine and still tells the sink, which may be mirroring', async () => {
    const h = harness();

    await h.controller.pause();

    expect(names(h.engineCalls)).toEqual(['pause']);
    expect(names(h.sinkCalls)).toEqual(['pause']);
  });

  it('resumes only what was already playing after a skip', async () => {
    // A skip made while paused has to stay paused, or scrubbing the queue
    // starts the music.
    const paused = harness({ isPlaying: false });
    await paused.controller.skipToNext();
    expect(names(paused.engineCalls)).toEqual(['skipToNext']);

    const playing = harness({ isPlaying: true });
    await playing.controller.skipToNext();
    expect(names(playing.engineCalls)).toEqual(['skipToNext', 'play']);
  });

  it('will not skip past the end of the queue', async () => {
    const h = harness({ currentIndex: 2 });

    await h.controller.skipToNext();

    expect(h.engineCalls).toEqual([]);
  });

  it('wraps past the end when repeat is on for the queue', async () => {
    const h = harness({ currentIndex: 2, repeatMode: 'all' });

    await h.controller.skipToNext();

    expect(names(h.engineCalls)).toEqual(['skipToNext', 'play']);
  });

  it('will not skip back from the first track', async () => {
    const h = harness({ currentIndex: 0 });

    await h.controller.skipToPrevious();

    expect(h.engineCalls).toEqual([]);
  });

  it('clamps a forward jump to the end of the track', async () => {
    const h = harness({ localPosition: 195, localDuration: 200 });

    h.controller.jumpBy(30);

    expect(h.engineCalls).toEqual([{ name: 'seekTo', args: [200] }]);
  });

  it('clamps a backward jump to the start', async () => {
    const h = harness({ localPosition: 5, localDuration: 200 });

    h.controller.jumpBy(-30);

    expect(h.engineCalls).toEqual([{ name: 'seekTo', args: [0] }]);
  });
});

describe('when a remote sink owns playback', () => {
  /**
   * The rule that matters. The local engine is not running, and starting it
   * would play a second copy of the track out of this device while the room
   * plays the first.
   */
  it('never touches the local engine', async () => {
    const h = harness({ remote: true });

    await h.controller.pause();
    await h.controller.resume();
    h.controller.seek(42);
    await h.controller.skipToNext();
    await h.controller.skipToPrevious();

    expect(h.engineCalls).toEqual([]);
  });

  it('sends every command to the sink instead', async () => {
    const h = harness({ remote: true, currentIndex: 1 });

    await h.controller.pause();
    await h.controller.resume();
    h.controller.seek(42);
    await h.controller.skipToNext();
    await h.controller.skipToPrevious();

    expect(h.sinkCalls).toEqual([
      { name: 'pause', args: [] },
      { name: 'resume', args: [] },
      { name: 'seek', args: [42] },
      { name: 'skipTo', args: [2] },
      { name: 'skipTo', args: [0] },
    ]);
  });

  it('wraps to the start of the queue rather than asking for an index past it', async () => {
    const h = harness({ remote: true, currentIndex: 2, repeatMode: 'all' });

    await h.controller.skipToNext();

    expect(h.sinkCalls).toEqual([{ name: 'skipTo', args: [0] }]);
  });

  it('measures a listen from the remote, not from the idle local engine', async () => {
    // The local engine stopped playing this track however long ago; filing the
    // listen with its position means filing it as zero, and a zero-length
    // listen is never scrobbled.
    const h = harness({ remote: true, jukeboxPosition: 137.8, localPosition: 0 });

    await h.controller.skipToNext();

    expect(h.scrobbled).toEqual([137]);
  });

  it('jumps relative to the remote position, against the track own length', async () => {
    // The local engine reports no duration while the remote is playing, and a
    // clamp against zero would send every forward jump to the start.
    const h = harness({
      remote: true,
      jukeboxPosition: 100,
      localDuration: 0,
      queue: [resource('1', 300)],
      currentIndex: 0,
    });

    h.controller.jumpBy(30);

    expect(h.sinkCalls).toEqual([{ name: 'seek', args: [130] }]);
  });
});

describe('skipping to a chosen track', () => {
  it('does nothing for an index the queue does not have', async () => {
    const h = harness();

    await h.controller.skipTo(9);

    expect(h.engineCalls).toEqual([]);
    expect(h.active).toEqual([]);
  });

  it('files the outgoing listen and starts a new clock', async () => {
    const h = harness({ currentIndex: 0, localPosition: 90 });

    await h.controller.skipTo(2);

    expect(h.scrobbled).toEqual([90]);
    expect(h.newListens).toBe(1);
    expect(h.active).toEqual([{ index: 2, id: '3' }]);
  });

  it('does not re-file or restart the clock for the track already playing', async () => {
    // Tapping the current track would otherwise scrobble the same play twice,
    // and restarting the clock would stop the play in progress ever reaching
    // the threshold.
    const h = harness({ currentIndex: 1, localPosition: 90 });

    await h.controller.skipTo(1);

    expect(h.scrobbled).toEqual([]);
    expect(h.newListens).toBe(0);
    expect(h.active).toEqual([{ index: 1, id: '2' }]);
  });
});

/**
 * The controller is where a seek and a departure are both *known*, and it was
 * telling nothing about either beyond a playhead. How much of a track was
 * heard is a different number the moment somebody rewinds, and it is not
 * recoverable a second later — the outgoing report is deferred, and the
 * session has started the next listen's clock by the time it runs.
 */
describe('what the listen meter is told', () => {
  beforeEach(() => { resetListen(); });

  it('closes the meter on the track being left, not on the one arriving', async () => {
    const h = harness({ currentIndex: 0, localPosition: 20 });
    observePosition(0);
    observePosition(10);

    await h.controller.skipToNext();

    // Latched against the song that was playing, so the deferred report finds
    // it under the right name. Twenty, not ten: the departure closes the gap
    // since the last heartbeat, which is real play nobody else would credit.
    expect(takeFinishedListen('1')).toBe(20);
  });

  it('credits the play before a seek instead of losing it to the next heartbeat', () => {
    const h = harness({ localPosition: 10 });
    observePosition(0);

    h.controller.seek(0);
    // Ten seconds heard, then a rewind to the start. Left to the heartbeat to
    // notice, the jump would read as a seek and those ten seconds would go.
    observePosition(5);

    expect(listenedSoFar(5)).toBe(15);
  });

  it('credits the play before a relative jump too', () => {
    const h = harness({ localPosition: 10 });
    observePosition(0);

    h.controller.jumpBy(-10);
    observePosition(5);

    expect(listenedSoFar(5)).toBe(15);
  });

  it('never credits the jump itself', () => {
    const h = harness({ localPosition: 10 });
    observePosition(0);

    // Scrubbing to the end is not listening to the middle.
    h.controller.seek(190);

    expect(listenedSoFar(190)).toBe(10);
  });
});
