import { createNavidromeClient, SubsonicRequestError } from './client';
import { ServerFeatureUnavailableError } from '@/providers/contracts/ServerAdapter';

const mockServerFetch = jest.fn();
jest.mock('@/features/mtls/serverFetch', () => ({
  serverFetch: (...args: unknown[]) => mockServerFetch(...args),
}));

const respond = (body: unknown, status = 200) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const client = () =>
  createNavidromeClient({
    serverUrl: 'https://music.example.com',
    username: 'zack',
    password: 'hunter2',
  });

/**
 * A Subsonic server refuses a request with HTTP 200.
 *
 * Wrong credentials, a missing parameter, a library the account can't see —
 * every one comes back `200 OK` with `status: "failed"` in the body. The client
 * only threw on a non-2xx status, so a refusal reached the fetchers as a normal
 * response with no `albumList` in it, and they read that as a library with
 * nothing in it. Cached as a success under `staleTime: Infinity`, it never
 * refetched: on a cold start that raced the keystore read, Albums, Tracks and
 * Artists stayed empty until the app's data was cleared.
 */
describe('form POST', () => {
  beforeEach(() => mockServerFetch.mockReset());

  const ok = { 'subsonic-response': { status: 'ok' } };
  const extensions = (names: string[]) => ({
    'subsonic-response': { status: 'ok', openSubsonicExtensions: names.map(name => ({ name, versions: [1] })) },
  });

  it('sends a POST form-encoded in the body when the server declares formPost', async () => {
    mockServerFetch
      .mockReturnValueOnce(respond(extensions(['formPost', 'songLyrics'])))
      .mockReturnValue(respond(ok));
    const nd = client();

    await nd.request('updatePlaylist.view', { playlistId: 'p1', songIdToAdd: ['a', 'b'] }, { method: 'POST' });
    await nd.request('updatePlaylist.view', { playlistId: 'p1' }, { method: 'POST' });

    const [url, init] = mockServerFetch.mock.calls[1];
    expect(url).toBe('https://music.example.com/rest/updatePlaylist.view');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(init.body).getAll('songIdToAdd')).toEqual(['a', 'b']);
    // Asked once, not per request.
    expect(mockServerFetch.mock.calls.filter(([u]) => String(u).includes('getOpenSubsonicExtensions'))).toHaveLength(1);
  });

  it('keeps parameters in the URL on a server without it, or one that cannot say', async () => {
    mockServerFetch
      .mockReturnValueOnce(respond({ 'subsonic-response': { status: 'failed', error: { code: 0, message: 'not found' } } }))
      .mockReturnValue(respond(ok));

    await client().request('updatePlaylist.view', { playlistId: 'p1' }, { method: 'POST' });

    const [url, init] = mockServerFetch.mock.calls[1];
    expect(url).toContain('/rest/updatePlaylist.view?');
    expect(url).toContain('playlistId=p1');
    expect(init.body).toBeUndefined();
  });

  it('never asks for extensions on a GET', async () => {
    mockServerFetch.mockReturnValue(respond(ok));

    await client().request('ping.view');

    expect(mockServerFetch).toHaveBeenCalledTimes(1);
  });
});

describe('request', () => {
  beforeEach(() => mockServerFetch.mockReset());

  it('rejects a refused request instead of returning it as data', async () => {
    mockServerFetch.mockReturnValueOnce(respond({
      'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong username or password' } },
    }));

    const request = client().request('getAlbumList.view', { type: 'newest' });

    await expect(request).rejects.toBeInstanceOf(SubsonicRequestError);
    await expect(request).rejects.toMatchObject({ code: 40, message: 'Wrong username or password' });
  });

  it('still hands back an ok response untouched', async () => {
    const body = { 'subsonic-response': { status: 'ok', albumList: { album: [] } } };
    mockServerFetch.mockReturnValueOnce(respond(body));

    await expect(client().request('getAlbumList.view')).resolves.toEqual(body);
  });

  it('reports an endpoint the server has not implemented as a feature it lacks', async () => {
    // What Navidrome answers to getPodcasts, and to getShares with sharing off.
    mockServerFetch.mockReturnValueOnce(respond('This endpoint is not implemented, but may be in future releases', 501));

    await expect(client().request('getPodcasts.view')).rejects.toBeInstanceOf(ServerFeatureUnavailableError);
  });

  it('still rejects a non-2xx response', async () => {
    mockServerFetch.mockReturnValueOnce(respond('nope', 502));

    await expect(client().request('ping.view')).rejects.toThrow('Navidrome API error (502)');
  });
});

describe('buildStreamUrl', () => {
  it('omits format entirely for Original, rather than sending the internal "raw" sentinel', () => {
    // Navidrome only serves the untouched file when `format` is absent — an
    // explicit `format=raw` is not a value it recognises and hands the
    // request to the transcoding subsystem instead of skipping it.
    const url = client().buildStreamUrl('song-1', 'original');

    expect(url).not.toContain('format=');
  });

  it('still asks for a transcode by name at every other quality', () => {
    expect(client().buildStreamUrl('song-1', 'low')).toContain('format=mp3');
    expect(client().buildStreamUrl('song-1', 'low')).toContain('maxBitRate=128');
    expect(client().buildStreamUrl('song-1', 'high')).toContain('format=mp3');
    expect(client().buildStreamUrl('song-1', 'high')).toContain('maxBitRate=320');
  });
});
