import type { MediaItem } from './mediaItem';

/**
 * The engine backend's own behaviour, with the native module faked.
 *
 * Two things are worth testing here and neither is the forwarding. The first
 * is the optimistic queue edit: `getQueue()` answers synchronously, so the
 * backend has to predict what the engine will do and it duplicates the
 * engine's index rule in TypeScript to manage it. Duplicated rules drift, and
 * these tests are the thing that notices.
 *
 * The second is that a failed call becomes an event. Commands are fired and
 * not awaited, so anything that fails quietly is a track that never plays with
 * nothing in the log to say why.
 */

const mockCalls: { name: string; args: unknown[] }[] = [];
let mockListener: ((event: unknown) => void) | null = null;
let mockFailing: string | null = null;
let mockSetupGate: Promise<void> | null = null;
/** What the engine answers for the getters the backend reads back. */
const mockReturns: Record<string, unknown> = {};

const mockEngine = new Proxy(
  {},
  {
    get(_target, name: string) {
      if (name === 'addListener') {
        return (fn: (event: unknown) => void) => {
          mockListener = fn;
          return () => { mockListener = null; };
        };
      }
      return (...args: unknown[]) => {
        mockCalls.push({ name, args });
        if (name === mockFailing) return Promise.reject(new Error('nope'));
        // `setup` can be held open, so a test can reproduce the window in
        // which the native graph does not exist yet.
        if (name === 'setup' && mockSetupGate) return mockSetupGate;
        if (name in mockReturns) return Promise.resolve(mockReturns[name]);
        return Promise.resolve();
      };
    },
  }
);

jest.mock('yuzic-engine', () => ({ YuzicEngine: mockEngine }), { virtual: true });

const { createEngineBackend } = require('./createEngineBackend');

const item = (id: string, over: Partial<MediaItem> = {}): MediaItem => ({
  mediaId: id,
  title: id,
  artist: 'Someone',
  albumTitle: 'An Album',
  duration: 100,
  url: `https://example/${id}`,
  ...over,
});

const named = (name: string) => mockCalls.filter(call => call.name === name);

/**
 * The commands sent, without the queue reads. Setup reads the engine's queue
 * once (so a queue the car started while the app was asleep is not lost); the
 * gate tests are about commands being held and ordered, which a read is not.
 */
const QUEUE_READS = new Set(['getQueue', 'getActiveIndex']);
const commands = () => mockCalls.map(c => c.name).filter(name => !QUEUE_READS.has(name));

/**
 * Drain the microtask queue.
 *
 * Needed because the backend fires commands without awaiting them: a rejection
 * travels through an async function that adopted the inner promise, which is
 * several ticks, and `setup` subscribes only after its own await. Counting
 * `Promise.resolve()`s here would be pinning the number of awaits in the
 * implementation, which is not the behaviour under test.
 */
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(() => {
  mockCalls.length = 0;
  mockListener = null;
  mockFailing = null;
  mockSetupGate = null;
  for (const key of Object.keys(mockReturns)) delete mockReturns[key];
  // Several tests here make calls fail on purpose, and `fire` warns on every
  // failure so a release build leaves a trace. Silenced rather than tolerated:
  // expected output that looks like a problem trains you to ignore the run.
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the queue the app can read straight away', () => {
  it('reflects a set queue before the engine has confirmed anything', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a'), item('b')], 1);
    // No await anywhere — this is what a caller doing `setMediaItems(...)`
    // then `getQueue()` on the next line sees.
    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['a', 'b']);
    expect(backend.getActiveMediaItemIndex()).toBe(1);
    expect(backend.getActiveMediaItem()?.mediaId).toBe('b');
  });

  it('keeps the playing track when something is inserted above it', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a'), item('b'), item('c')], 1);
    backend.insertMediaItem(0, item('new'));
    // Same rule the engine applies natively: inserting at or before the
    // playhead pushes it down so the music does not jump.
    expect(backend.getActiveMediaItem()?.mediaId).toBe('b');
    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['new', 'a', 'b', 'c']);
  });

  it('keeps the playing track when something above it is removed', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a'), item('b'), item('c')], 2);
    backend.removeMediaItem(0);
    expect(backend.getActiveMediaItem()?.mediaId).toBe('c');
  });

  it('follows the playing track when it is the one moved', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a'), item('b'), item('c')], 0);
    backend.moveMediaItem(0, 2);
    expect(backend.getActiveMediaItem()?.mediaId).toBe('a');
    expect(backend.getActiveMediaItemIndex()).toBe(2);
  });

  it('keeps the playing track when something moves across it', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a'), item('b'), item('c'), item('d')], 2);
    backend.moveMediaItem(0, 3);
    expect(backend.getActiveMediaItem()?.mediaId).toBe('c');
  });

  it('empties on clear', () => {
    const backend = createEngineBackend();
    backend.setMediaItems([item('a')], 0);
    backend.clear();
    expect(backend.getQueue()).toEqual([]);
    // Null, not undefined, and not index 0 — "nothing is active" is a distinct
    // answer that the app branches on, and rntp says it the same way.
    expect(backend.getActiveMediaItem()).toBeNull();
    expect(backend.getActiveMediaItemIndex()).toBeNull();
  });
});

describe('talking to the engine', () => {
  /**
   * Every call now waits behind setup, so a test that wants to see one arrive
   * has to let setup happen first — which is what the app does on mount. The
   * earlier version of these tests called the backend without setting it up
   * and asserted the call went straight out, which is precisely the behaviour
   * that broke a restored queue on every cold launch.
   */
  async function readyBackend() {
    const backend = createEngineBackend();
    backend.setup();
    await new Promise(resolve => setTimeout(resolve, 0));
    return backend;
  }

  it('translates the app repeat vocabulary into the engine one', async () => {
    const backend = await readyBackend();
    backend.setRepeatMode('track');
    backend.setRepeatMode('queue');
    backend.setRepeatMode('off');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(named('setRepeatMode').map(c => c.args[0])).toEqual(['one', 'all', 'off']);
  });

  it('sends tracks in the engine shape, not the app one', async () => {
    const backend = await readyBackend();
    backend.setMediaItems([item('a', { url: { uri: 'file:///x.flac' } })], 0);
    await new Promise(resolve => setTimeout(resolve, 0));
    const sent = named('setQueue')[0].args[0] as { uri: string; id: string }[];
    expect(sent[0]).toMatchObject({ id: 'a', uri: 'file:///x.flac' });
  });
});

describe('the cold-launch race', () => {
  /**
   * The bug this prevents, reported from a TestFlight build: the app opened,
   * showed the track, and sat paused until it was restarted.
   *
   * Every transport function on the native side is `self.engine?.play()`, so a
   * call arriving before the graph exists is optional-chained into a silent
   * no-op — no error, no event, nothing to grep for. Setup is slowest on a
   * cold first launch, which is exactly when the restored queue issues
   * `setMediaItems` and `play`.
   */
  it('holds transport calls until setup has finished', async () => {
    let openTheGate: () => void = () => {};
    mockSetupGate = new Promise<void>(resolve => {
      openTheGate = resolve;
    });

    const backend = createEngineBackend();
    backend.setup();
    backend.setMediaItems([item('a')], 0);
    backend.play();

    await Promise.resolve();
    expect(commands()).toEqual(['setup']);

    openTheGate();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(commands()).toEqual(['setup', 'setQueue', 'play']);
  });

  /**
   * The half the gate used to miss: a call made *before* `setup`.
   *
   * The gate was created inside `setup()`, so until that ran there was nothing
   * to wait behind and a call went straight out to an engine that did not
   * exist — rejected with "the engine is not set up". That is not a
   * hypothetical ordering. `setup()` is invoked from an effect declared below
   * the one that restores the persisted queue, and React runs effects in
   * declaration order, so the restore's `setQueue` always went first.
   *
   * The result was an app that came up showing the remembered queue with the
   * player never having been given it: press play, nothing happens. Silent,
   * because the rejection was swallowed further up.
   */
  it('holds calls made before setup is even called', async () => {
    const backend = createEngineBackend();

    // Before any setup, exactly as the restore does on a cold launch.
    backend.setMediaItems([item('a')], 0);
    await flush();
    expect(mockCalls.map(c => c.name)).toEqual([]);

    backend.setup();
    await flush();

    expect(commands()).toEqual(['setup', 'setQueue']);
  });

  /** Order is preserved once the gate opens — a play must not overtake a queue. */
  it('replays the held calls in the order they were made', async () => {
    let openTheGate: () => void = () => {};
    mockSetupGate = new Promise<void>(resolve => {
      openTheGate = resolve;
    });

    const backend = createEngineBackend();
    backend.setup();
    backend.setMediaItems([item('a')], 0);
    backend.seekTo(30);
    backend.play();

    openTheGate();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(commands()).toEqual(['setup', 'setQueue', 'seekTo', 'play']);
  });

  /**
   * A setup that fails must not block the transport for the life of the
   * process. It reports itself; the player should still try.
   */
  it('opens the gate even when setup fails', async () => {
    mockFailing = 'setup';

    const backend = createEngineBackend();
    backend.setup();
    backend.play();

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(mockCalls.map(c => c.name)).toContain('play');
  });
});

describe('failures the app would otherwise never see', () => {
  it('turns a rejected call into an error event', async () => {
    const backend = createEngineBackend();
    const seen: unknown[] = [];
    backend.addListener((event: unknown) => seen.push(event));

    // Set up first: transport now waits behind the gate, as it does in the app.
    backend.setup();
    await flush();

    mockFailing = 'play';
    backend.play();
    // The rejection is caught inside; let it get there.
    await flush();

    expect(seen).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'ENGINE_CALL_FAILED' })
    );
  });

  it('names the call that failed, so the log says which one', async () => {
    const backend = createEngineBackend();
    const seen: { message?: string }[] = [];
    backend.addListener((event: { type: string; message?: string }) => {
      if (event.type === 'error') seen.push(event);
    });

    backend.setup();
    await flush();

    mockFailing = 'seekTo';
    backend.seekTo(30);
    await flush();

    expect(seen[0]?.message).toContain('seekTo');
  });
});

describe('events from the engine', () => {
  it('re-emits a track change and moves the shadow with it', async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();
    backend.setMediaItems([item('a'), item('b')], 0);

    const seen: { type: string }[] = [];
    backend.addListener((event: { type: string }) => seen.push(event));

    mockListener?.({ type: 'trackChange', index: 1, id: 'b' });

    expect(backend.getActiveMediaItemIndex()).toBe(1);
    expect(seen).toContainEqual(expect.objectContaining({ type: 'trackChange', index: 1 }));
  });

  it('serves progress the engine pushed, in the app shape', async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();
    mockListener?.({
      type: 'progress',
      progress: { positionSec: 10, durationSec: 200, bufferedSec: 25 },
    });
    // buffered arrives absolute and is served as remaining runway.
    expect(backend.getProgress()).toEqual({ position: 10, duration: 200, buffered: 15 });
  });

  it('stops delivering to a listener that unsubscribed', async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();
    const seen: unknown[] = [];
    const off = backend.addListener((event: unknown) => seen.push(event));
    off();
    mockListener?.({ type: 'stateChange', state: 'playing' });
    expect(seen).toEqual([]);
  });
});

describe('queueChange', () => {
  /**
   * The event exists so the app can stop keeping its own splice arithmetic.
   * If it arrived before the shadow had been replaced, a listener reacting
   * with `getQueue()` would read back the very prediction the event was sent
   * to correct — which is worse than not emitting at all.
   */
  it('re-reads the engine before telling the app the queue moved', async () => {
    const backend = createEngineBackend();
    const seen: string[][] = [];
    backend.addListener((event: { type: string }) => {
      if (event.type === 'queueChange') seen.push(backend.getQueue().map((i: MediaItem) => i.mediaId as string));
    });
    backend.setup();
    await flush();

    backend.setMediaItems([item('a'), item('b'), item('c')], 0);
    // The engine says `b` is gone — a drop the app never asked for and could
    // not have predicted.
    mockReturns.getQueue = [{ id: 'a' }, { id: 'c' }];
    mockReturns.getActiveIndex = 1;

    mockListener?.({ type: 'queueChange' });
    await flush();

    expect(seen).toEqual([['a', 'c']]);
    expect(backend.getActiveMediaItemIndex()).toBe(1);
  });

  it('keeps the app\'s own items, which the engine cannot hand back', async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setMediaItems([item('a', { headers: { Authorization: 'Basic x' } })], 0);
    mockReturns.getQueue = [{ id: 'a' }];
    mockReturns.getActiveIndex = 0;

    mockListener?.({ type: 'queueChange' });
    await flush();

    // The resolved URL and the request headers were never sent back across the
    // bridge; losing them here would mean a protected server stopped playing
    // the moment the queue was reconciled.
    expect(backend.getQueue()[0].headers).toEqual({ Authorization: 'Basic x' });
    expect(backend.getQueue()[0].url).toBe('https://example/a');
  });

  it('says nothing when the engine could not be read', async () => {
    const backend = createEngineBackend();
    const seen: unknown[] = [];
    backend.addListener((event: { type: string }) => {
      if (event.type === 'queueChange') seen.push(event);
    });
    backend.setup();
    await flush();
    backend.setMediaItems([item('a')], 0);

    mockFailing = 'getQueue';
    mockListener?.({ type: 'queueChange' });
    await flush();

    // The queue the app is showing is the one it last set, which is the best
    // answer available — and a thrown error here would surface as a playback
    // failure the listener's music never had.
    expect(seen).toEqual([]);
    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['a']);
  });
});

describe('a queue the car started', () => {
  /**
   * A CarPlay or Android Auto selection plays natively: the engine replaces
   * its queue with the tracks under the chosen row, starts one, and only then
   * announces the queue change. The app never queued any of it, so it has to
   * learn both what is playing and what each track is from the engine.
   */
  it('reports the track change only once the shadow holds the tracks the car queued', async () => {
    const backend = createEngineBackend();
    const seen: { type: string; active?: string }[] = [];
    backend.addListener((event: { type: string }) => {
      if (event.type === 'trackChange' || event.type === 'queueChange') {
        seen.push({ type: event.type, active: backend.getActiveMediaItem()?.mediaId });
      }
    });
    backend.setup();
    await flush();

    backend.setMediaItems([item('old1'), item('old2')], 0);
    mockReturns.getQueue = [
      { id: 'car1', uri: 'https://example/car1', title: 'Car One', artist: 'Driver', durationSec: 180, headers: { Authorization: 'Basic y' } },
      { id: 'car2', uri: 'https://example/car2', title: 'Car Two' },
    ];
    mockReturns.getActiveIndex = 0;

    // The native order: the track starts, then the queue change is announced.
    mockListener?.({ type: 'trackChange', index: 0, id: 'car1' });
    mockListener?.({ type: 'queueChange' });
    await flush();

    expect(seen.find(event => event.type === 'trackChange')?.active).toBe('car1');
    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['car1', 'car2']);
  });

  it("takes each unknown track's details from the engine's own record rather than an empty stub", async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setMediaItems([item('old1')], 0);
    mockReturns.getQueue = [
      { id: 'car1', uri: 'https://example/car1', title: 'Car One', artist: 'Driver', durationSec: 180, headers: { Authorization: 'Basic y' } },
    ];
    mockReturns.getActiveIndex = 0;

    mockListener?.({ type: 'queueChange' });
    await flush();

    expect(backend.getQueue()[0]).toMatchObject({
      mediaId: 'car1',
      url: 'https://example/car1',
      title: 'Car One',
      artist: 'Driver',
      duration: 180,
      headers: { Authorization: 'Basic y' },
    });
  });

  it('takes a queue the engine already holds when the app starts listening', async () => {
    // The car played while the app's JavaScript was asleep, so no event
    // reached it. Waking up believing nothing was queued is what let the
    // persisted-queue restore load last session's queue over the car's.
    mockReturns.getQueue = [{ id: 'car1', uri: 'https://example/car1', title: 'Car One' }];
    mockReturns.getActiveIndex = 0;
    const backend = createEngineBackend();

    backend.setup();
    await flush();

    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['car1']);
  });

  it('says which of the adopted tracks is playing, not only that there is a queue', async () => {
    // Seen on an Android Automotive emulator: the app opened over a queue the
    // car was playing, took the queue, and showed "No song playing" over the
    // car's music until the next track, because only a track change sets
    // what is playing and the one that started it went to no listener.
    mockReturns.getQueue = [
      { id: 'car1', uri: 'https://example/car1', title: 'Car One' },
      { id: 'car2', uri: 'https://example/car2', title: 'Car Two' },
    ];
    mockReturns.getActiveIndex = 1;
    const backend = createEngineBackend();
    const changes: (number | undefined)[] = [];
    backend.addListener((event: { type: string; index?: number }) => {
      if (event.type === 'trackChange') changes.push(event.index);
    });

    backend.setup();
    await flush();

    expect(changes).toEqual([1]);
    expect(backend.getActiveMediaItem()?.mediaId).toBe('car2');
  });

  it('says once that the engine has been asked, whether or not it held anything', async () => {
    // The persisted-queue restore waits on this, so it has to arrive in both
    // cases, and exactly once.
    for (const held of [[{ id: 'car1', uri: 'https://example/car1', title: 'Car One' }], []]) {
      mockReturns.getQueue = held;
      mockReturns.getActiveIndex = 0;
      const backend = createEngineBackend();
      const known: unknown[] = [];
      backend.addListener((event: { type: string }) => {
        if (event.type === 'engineQueueKnown') known.push(event);
      });
      expect(backend.engineQueueKnown()).toBe(false);

      backend.setup();
      await flush();

      expect(backend.engineQueueKnown()).toBe(true);
      expect(known).toHaveLength(1);
    }
  });

  it('says nothing about a track when there was nothing to adopt', async () => {
    mockReturns.getQueue = [];
    mockReturns.getActiveIndex = 0;
    const backend = createEngineBackend();
    const changes: unknown[] = [];
    backend.addListener((event: { type: string }) => {
      if (event.type === 'trackChange') changes.push(event);
    });

    backend.setup();
    await flush();

    expect(changes).toEqual([]);
  });

  it('does not let an engine that has not received the app queue yet wipe it at setup', async () => {
    // The app's own setQueue is held until setup finishes and replayed right
    // after the setup-time read goes out, so "empty" here may just be early.
    mockReturns.getQueue = [];
    mockReturns.getActiveIndex = 0;
    const backend = createEngineBackend();

    backend.setMediaItems([item('a')], 0);
    backend.setup();
    await flush();

    expect(backend.getQueue().map((i: MediaItem) => i.mediaId)).toEqual(['a']);
  });
});

describe('the browse tree the car is given', () => {
  interface Node {
    id: string;
    artworkUri?: string;
    artworkHeaders?: Record<string, string>;
    children?: Node[];
    playable?: { artworkUri?: string };
  }

  const treeSent = () => (named('setBrowseTree')[0].args[0] as { children: Node[] });
  const rowsOf = (tree: { children: Node[] }) => tree.children[0].children ?? [];

  const row = (over: Record<string, unknown> = {}) => ({
    mediaId: 'album-1',
    title: 'An Album',
    artist: 'Someone',
    artworkUrl: 'https://library.test/cover/1.jpg',
    ...over,
  });

  const category = (items: ReturnType<typeof row>[]) => ({
    mediaId: 'albums',
    title: 'Albums',
    items,
  });

  it("sends each row's own thumbnail", async () => {
    // It was never sent at all, so the car drew a column of titles with no
    // covers even though every row had a URL sitting on it.
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([row()])]);
    await flush();

    expect(rowsOf(treeSent())[0].artworkUri).toBe('https://library.test/cover/1.jpg');
  });

  it('sends the artwork headers a protected server needs', async () => {
    // Without them the server answers 401 for every thumbnail and the car
    // shows blank squares, while the same cover renders on the now-playing
    // screen from the track's own headers.
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([
      row({ artworkHeaders: { Authorization: 'Basic abc' } }),
    ])]);
    await flush();

    expect(rowsOf(treeSent())[0].artworkHeaders).toEqual({ Authorization: 'Basic abc' });
  });

  it('leaves artworkHeaders off entirely for an unprotected server', async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([row()])]);
    await flush();

    expect(rowsOf(treeSent())[0]).not.toHaveProperty('artworkHeaders');
  });

  it('gives a folder a thumbnail and nothing to play', async () => {
    // A row is a folder because it has no url, not because of where it sits —
    // and a folder still has a cover.
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([row({ children: [row({ mediaId: 'track-1' })] })])]);
    await flush();

    const folder = rowsOf(treeSent())[0];
    expect(folder.artworkUri).toBe('https://library.test/cover/1.jpg');
    expect(folder.playable).toBeUndefined();
    expect(folder.children).toHaveLength(1);
  });

  it("carries the thumbnail down to a playable row as well as its track", async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([
      row({ mediaId: 'track-1', url: 'https://library.test/stream/1' }),
    ])]);
    await flush();

    const leaf = rowsOf(treeSent())[0];
    expect(leaf.artworkUri).toBe('https://library.test/cover/1.jpg');
    expect(leaf.playable?.artworkUri).toBe('https://library.test/cover/1.jpg');
  });

  it('gives the same song a different node id in each place it sits', async () => {
    // The engine keeps the first of a repeated id, so a favourite song used to
    // vanish from its album in the car. The track keeps its own id.
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    const song = row({ mediaId: 'song-1', url: 'https://library.test/stream/1' });
    backend.setBrowseTree([
      { mediaId: 'favorites', title: 'Favorites', items: [song] },
      { mediaId: 'albums', title: 'Albums', items: [row({ mediaId: 'album-1', children: [song] })] },
    ]);
    await flush();

    const tree = treeSent();
    const favourite = tree.children[0].children![0] as Node & { playable?: { id?: string } };
    const inAlbum = tree.children[1].children![0].children![0] as Node & { playable?: { id?: string } };
    expect(favourite.id).toBe('favorites/song-1');
    expect(inAlbum.id).toBe('albums/album-1/song-1');
    expect(favourite.playable?.id).toBe('song-1');
    expect(inAlbum.playable?.id).toBe('song-1');
  });

  it("carries a tab's icon and layout, and a shuffle row's action", async () => {
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([{
      mediaId: 'albums',
      title: 'Albums',
      icon: 'albums',
      layout: 'grid',
      items: [{ mediaId: 'shuffle', title: 'Shuffle', action: 'shuffle' }],
    }]);
    await flush();

    const tab = treeSent().children[0] as Node & { icon?: string; layout?: string };
    expect(tab).toMatchObject({ icon: 'albums', layout: 'grid' });
    expect(tab.children![0]).toMatchObject({ id: 'albums/shuffle', action: 'shuffle' });
    expect(tab.children![0].playable).toBeUndefined();
  });

  it('does not send the same tree twice, and sends again after a clear', async () => {
    // Every send is the car redrawing under the driver, and on Android the
    // whole tree encrypted and written to disk.
    const backend = createEngineBackend();
    backend.setup();
    await flush();

    backend.setBrowseTree([category([row()])]);
    backend.setBrowseTree([category([row()])]);
    await flush();
    expect(named('setBrowseTree')).toHaveLength(1);

    backend.setBrowseTree([category([row({ title: 'Renamed' })])]);
    await flush();
    expect(named('setBrowseTree')).toHaveLength(2);

    backend.clearBrowseTree();
    backend.setBrowseTree([category([row({ title: 'Renamed' })])]);
    await flush();
    expect(named('setBrowseTree')).toHaveLength(3);
  });
});
