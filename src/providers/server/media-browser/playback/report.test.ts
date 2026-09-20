import {
  clearPlaybackPosition,
  reportPlaybackProgress,
  reportPlaybackStart,
  reportPlaybackStop,
} from './report';
import { playMethodForStreamFormat } from './playMethod';
import { createMediaBrowserClient, type MediaBrowserClient } from '../client';
import { JELLYFIN_BRAND } from '../brand';

function makeClient(overrides: Partial<MediaBrowserClient> = {}): MediaBrowserClient {
  return {
    request: jest.fn().mockResolvedValue({}),
    requestText: jest.fn().mockResolvedValue(''),
    serverUrl: 'https://server.example',
    token: 'tok',
    userId: 'user-1',
    parentId: undefined,
    buildStreamUrl: jest.fn(),
    playMethodFor: jest.fn(() => 'DirectPlay' as const),
    brand: JELLYFIN_BRAND,
    ...overrides,
  } as MediaBrowserClient;
}

/** The JSON body of the nth request the client was asked to make. */
function bodyOf(client: MediaBrowserClient, call = 0): Record<string, unknown> {
  const [, init] = (client.request as jest.Mock).mock.calls[call];
  return JSON.parse(init.body);
}

/**
 * The unit is the whole point. Jellyfin counts in 100-nanosecond intervals, so
 * a position in milliseconds is out by a factor of ten thousand — and the
 * quantity that lands here decides whether the server's Last.fm plugin
 * scrobbles, where the resume point goes, and whether the item is marked
 * played. A silent factor-of-ten-thousand error reads as "the listener was at
 * zero" every time.
 */
describe('position ticks', () => {
  it('converts milliseconds to 100-nanosecond ticks', async () => {
    const client = makeClient();
    await reportPlaybackStop(client, 'item-1', 42_000);

    expect(client.request).toHaveBeenCalledWith('/Sessions/Playing/Stopped', expect.anything());
    expect(bodyOf(client)).toMatchObject({ ItemId: 'item-1', PositionTicks: 420_000_000 });
  });

  it('never sends a negative position, whatever it is handed', async () => {
    const client = makeClient();
    await reportPlaybackStop(client, 'item-1', -5_000);

    expect(bodyOf(client)).toMatchObject({ PositionTicks: 0 });
  });

  it('clears the resume point by stopping at zero', async () => {
    const client = makeClient();
    await clearPlaybackPosition(client, 'item-1');

    // Zero is also what keeps this from scrobbling: the server plugins submit
    // on a percentage of the runtime, and nothing is below zero.
    expect(bodyOf(client)).toMatchObject({ PositionTicks: 0 });
  });
});

/**
 * Every session report used to assert `DirectStream` — the one of the three
 * values that is never true from the client's side, since the app either asks
 * for the original bytes or asks for a re-encode.
 */
describe('play method', () => {
  it('calls the original file a direct play and anything else a transcode', () => {
    expect(playMethodForStreamFormat('raw')).toBe('DirectPlay');
    expect(playMethodForStreamFormat('mp3')).toBe('Transcode');
    expect(playMethodForStreamFormat('opus')).toBe('Transcode');
  });

  it('reports what the stream URL actually asked this server for', () => {
    const client = createMediaBrowserClient(
      { serverUrl: 'https://server.example', token: 'tok', userId: 'u1' },
      JELLYFIN_BRAND
    );
    // 'original' is the quality that resolves to Static=true; 'low' is the one
    // that makes the server re-encode.
    client.buildStreamUrl('direct-item', 'original', 'mp3');
    client.buildStreamUrl('transcoded-item', 'low', 'mp3');

    expect(client.playMethodFor('direct-item')).toBe('DirectPlay');
    expect(client.playMethodFor('transcoded-item')).toBe('Transcode');
  });

  it('assumes no server work for an item it was never asked to stream', () => {
    const client = createMediaBrowserClient(
      { serverUrl: 'https://server.example', token: 'tok', userId: 'u1' },
      JELLYFIN_BRAND
    );
    // A downloaded copy plays from the filesystem, so nothing ever built a
    // stream URL for it. The server is doing no work, which is what DirectPlay
    // says.
    expect(client.playMethodFor('never-streamed')).toBe('DirectPlay');
  });

  it('puts the method on the start and progress reports', async () => {
    const client = makeClient({ playMethodFor: jest.fn(() => 'Transcode' as const) });

    await reportPlaybackStart(client, 'item-1', 0);
    await reportPlaybackProgress(client, 'item-1', 1_000, false);

    expect(bodyOf(client, 0)).toMatchObject({ PlayMethod: 'Transcode', IsPaused: false });
    expect(bodyOf(client, 1)).toMatchObject({ PlayMethod: 'Transcode' });
  });
});

/**
 * The pause was invisible to the server: the caller hardcoded `false` and the
 * heartbeat that would have carried it stopped as soon as playback did.
 */
describe('pause reporting', () => {
  it('carries the pause through to the body and the event name', async () => {
    const client = makeClient();
    await reportPlaybackProgress(client, 'item-1', 30_000, true);

    expect(bodyOf(client)).toMatchObject({
      IsPaused: true,
      EventName: 'Pause',
      PositionTicks: 300_000_000,
    });
  });

  it('calls an unpaused tick a time update', async () => {
    const client = makeClient();
    await reportPlaybackProgress(client, 'item-1', 30_000, false);

    expect(bodyOf(client)).toMatchObject({ IsPaused: false, EventName: 'TimeUpdate' });
  });
});
