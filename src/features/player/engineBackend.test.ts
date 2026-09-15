import {
  applyEvent,
  createShadow,
  reconcileQueue,
  shadowNamesTrack,
  toEngineTrack,
  toMediaItem,
  toPlaybackProgress,
} from './engineBackend';
import type { MediaItem } from './mediaItem';

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  mediaId: 'song-1',
  title: 'Lonely',
  artist: 'Someone',
  albumTitle: 'An Album',
  duration: 180,
  url: 'https://example/stream?id=1',
  artworkUrl: 'https://example/cover.jpg',
  ...over,
});

describe('the shadow the synchronous getters read from', () => {
  it('takes progress from the engine as it arrives', () => {
    const after = applyEvent(createShadow(), {
      type: 'progress',
      progress: { positionSec: 12, durationSec: 180, bufferedSec: 30 },
    });
    expect(after.progress.positionSec).toBe(12);
  });

  it('resets position on a track change rather than carrying it over', () => {
    const playing = applyEvent(createShadow(), {
      type: 'progress',
      progress: { positionSec: 178, durationSec: 180, bufferedSec: 180 },
    });
    const next = applyEvent(playing, { type: 'trackChange', index: 1, id: 'song-2' });

    // Carried over, the new track would show as starting at 2:58 until the
    // next progress event — a visible jump backwards on every track change.
    expect(next.progress.positionSec).toBe(0);
    expect(next.activeIndex).toBe(1);
  });

  it('keeps where the outgoing track had got to across the change', () => {
    // The app reads this after the change. Without it, a track that played to
    // its end was filed as a zero-second listen and never counted as a play.
    const playing = applyEvent(createShadow(), {
      type: 'progress',
      progress: { positionSec: 178, durationSec: 180, bufferedSec: 180 },
    });
    const next = applyEvent(playing, { type: 'trackChange', index: 1, id: 'song-2' });

    expect(next.outgoingProgress.positionSec).toBe(178);
  });

  it('takes the new duration from the queue so the bar is not zero-width', () => {
    const withQueue = { ...createShadow(), queue: [item(), item({ duration: 240 })] };
    const next = applyEvent(withQueue, { type: 'trackChange', index: 1, id: 'song-2' });
    expect(next.progress.durationSec).toBe(240);
  });

  it('tracks whether the engine considers itself playing', () => {
    const playing = applyEvent(createShadow(), { type: 'stateChange', state: 'playing' });
    expect(playing.playing).toBe(true);
    const paused = applyEvent(playing, { type: 'stateChange', state: 'paused' });
    expect(paused.playing).toBe(false);
    // Buffering is not playing, but it is not paused either — what matters is
    // that a play button does not flip to "paused" every time a track loads.
    const buffering = applyEvent(playing, { type: 'stateChange', state: 'buffering' });
    expect(buffering.playing).toBe(false);
  });

  it('ignores events that say nothing about position or queue', () => {
    const before = applyEvent(createShadow(), {
      type: 'progress',
      progress: { positionSec: 5, durationSec: 100, bufferedSec: 20 },
    });
    const after = applyEvent(before, { type: 'error', code: 'X', message: 'nope' });
    expect(after).toEqual(before);
  });
});

describe('translating between the app and the engine', () => {
  it('carries the fields the engine actually uses', () => {
    const track = toEngineTrack(item());
    expect(track).toMatchObject({
      id: 'song-1',
      uri: 'https://example/stream?id=1',
      title: 'Lonely',
      album: 'An Album',
      durationSec: 180,
    });
  });

  it('unwraps the object form buildTrackItem uses for local files', () => {
    const track = toEngineTrack(item({ url: { uri: 'file:///music/a.flac' } }));
    expect(track.uri).toBe('file:///music/a.flac');
  });

  it('leaves an unknown duration absent rather than zero', () => {
    // The engine clamps a crossfade against the shorter track and treats these
    // differently: absent means "not known yet", zero means "no length".
    expect(toEngineTrack(item({ duration: undefined })).durationSec).toBeUndefined();
  });

  it('falls back to the url when a track carries no id', () => {
    // The engine keys its disk cache on the id. Without a fallback every such
    // track would share one cache entry.
    const track = toEngineTrack(item({ mediaId: undefined }));
    expect(track.id).toBe('https://example/stream?id=1');
  });

  it('gives an empty album rather than a missing one on the way back', () => {
    const back = toMediaItem(toEngineTrack(item({ albumTitle: '' })));
    expect(back.albumTitle).toBe('');
  });

  it('survives a round trip with the fields the app reads', () => {
    const back = toMediaItem(toEngineTrack(item()));
    expect(back).toMatchObject({
      mediaId: 'song-1',
      title: 'Lonely',
      artist: 'Someone',
      duration: 180,
    });
  });

  it('wires audio and artwork headers into the two distinct engine fields', () => {
    const track = toEngineTrack(item({
      headers: { Authorization: 'Basic abc' },
      artworkHeaders: { Authorization: 'Basic abc' },
    }));
    expect(track.headers).toEqual({ Authorization: 'Basic abc' });
    expect(track.artworkHeaders).toEqual({ Authorization: 'Basic abc' });
  });

  it('leaves both header fields absent when the item carries none', () => {
    const track = toEngineTrack(item());
    expect(track).not.toHaveProperty('headers');
    expect(track).not.toHaveProperty('artworkHeaders');
  });

  it('preserves both header fields across a round trip', () => {
    const back = toMediaItem(toEngineTrack(item({
      headers: { Authorization: 'Basic abc' },
      artworkHeaders: { Authorization: 'Basic def' },
    })));
    expect(back.headers).toEqual({ Authorization: 'Basic abc' });
    expect(back.artworkHeaders).toEqual({ Authorization: 'Basic def' });
  });

  it('keeps header fields absent across a round trip when unset', () => {
    const back = toMediaItem(toEngineTrack(item()));
    expect(back).not.toHaveProperty('headers');
    expect(back).not.toHaveProperty('artworkHeaders');
  });
});

describe('progress, in the shape the app expects', () => {
  it('converts buffered from absolute to remaining runway', () => {
    // The engine reports buffered on the same timeline as position — 30 means
    // "buffered up to 0:30" — and a caller asking how much runway is left
    // wants the difference.
    const out = toPlaybackProgress({ positionSec: 12, durationSec: 180, bufferedSec: 30 });
    expect(out).toEqual({ position: 12, duration: 180, buffered: 18 });
  });

  it('never reports negative runway', () => {
    // Position can momentarily exceed the last buffered figure between events.
    const out = toPlaybackProgress({ positionSec: 40, durationSec: 180, bufferedSec: 30 });
    expect(out.buffered).toBe(0);
  });
});

describe('reconcileQueue', () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({
    mediaId: id,
    title: id,
    url: `https://example/${id}`,
    ...over,
  });
  const shadowOf = (queue: ReturnType<typeof item>[], activeIndex = 0) => ({
    ...createShadow(),
    queue,
    activeIndex,
  });
  /** The engine's own record of a track, as `getQueue()` returns it. */
  const records = (...ids: string[]) => ids.map(id => ({ id, uri: `https://engine/${id}`, title: `engine ${id}` }));

  it('takes order and membership from the engine', () => {
    // The engine applied a move the app predicted differently. It is what
    // actually plays, so it wins.
    const next = reconcileQueue(shadowOf([item('a'), item('b'), item('c')]), records('c', 'a', 'b'), 0);

    expect(next.queue.map(i => i.mediaId)).toEqual(['c', 'a', 'b']);
  });

  it('drops a track the engine no longer has', () => {
    const next = reconcileQueue(shadowOf([item('a'), item('b'), item('c')]), records('a', 'c'), 0);

    expect(next.queue.map(i => i.mediaId)).toEqual(['a', 'c']);
  });

  it('keeps the app\'s own item for each id, not a rebuilt one', () => {
    // The URL and the headers were resolved by the app and never crossed the
    // bridge; the engine cannot return them, so they have to survive here or a
    // protected server stops playing the moment the queue is reconciled.
    const withAuth = item('a', { headers: { Authorization: 'Basic x' } });

    const next = reconcileQueue(shadowOf([withAuth]), records('a'), 0);

    expect(next.queue[0]).toBe(withAuth);
  });

  it("takes a track the app never queued from the engine's own record, rather than dropping or stubbing it", () => {
    // A CarPlay selection queues tracks natively, and a queue can outlive the
    // JavaScript context that set it. A stub with no URL could neither be
    // played nor named; dropping it would make every later index wrong.
    const next = reconcileQueue(shadowOf([item('a')]), [
      ...records('a'),
      { id: 'car', uri: 'https://engine/car', title: 'From the car', artist: 'Driver', durationSec: 90, headers: { Authorization: 'Basic y' } },
    ], 0);

    expect(next.queue.map(i => i.mediaId)).toEqual(['a', 'car']);
    expect(next.queue[1]).toMatchObject({
      url: 'https://engine/car',
      title: 'From the car',
      artist: 'Driver',
      duration: 90,
      headers: { Authorization: 'Basic y' },
    });
  });

  it('clamps an index that points past the end', () => {
    // An index past the end makes `getActiveMediaItem` undefined and every
    // caller of it wrong at once.
    const next = reconcileQueue(shadowOf([item('a'), item('b')], 1), records('a'), 5);

    expect(next.activeIndex).toBe(0);
  });

  it('answers zero for an emptied queue rather than a negative index', () => {
    const next = reconcileQueue(shadowOf([item('a')], 0), records(), -1);

    expect(next.queue).toEqual([]);
    expect(next.activeIndex).toBe(0);
  });

  it('says whether the shadow already names the track that started', () => {
    const shadow = shadowOf([item('a'), item('b')]);

    expect(shadowNamesTrack(shadow, 1, 'b')).toBe(true);
    // A car selection replaced the queue: the engine names a track the shadow
    // does not hold at that index, so the backend must re-read first.
    expect(shadowNamesTrack(shadow, 0, 'car1')).toBe(false);
    expect(shadowNamesTrack(shadow, 5, 'b')).toBe(false);
    // No id to check against: taken at its index, as before.
    expect(shadowNamesTrack(shadow, 1, undefined)).toBe(true);
  });

  it('leaves progress and playing-ness alone', () => {
    // A queue edit is not a transport event. Resetting either here would show
    // the progress bar jumping on an insert the listener made while playing.
    const before = { ...shadowOf([item('a')]), playing: true, progress: { positionSec: 30, durationSec: 100, bufferedSec: 40 } };

    const next = reconcileQueue(before, records('a'), 0);

    expect(next.playing).toBe(true);
    expect(next.progress.positionSec).toBe(30);
  });
});
