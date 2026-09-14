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
