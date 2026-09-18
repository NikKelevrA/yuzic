import { connect } from './connect';
import { EMBY_BRAND, JELLYFIN_BRAND } from '../brand';
import { serverFetch } from '@/features/mtls/serverFetch';

jest.mock('@/features/mtls/serverFetch', () => ({ serverFetch: jest.fn() }));
jest.mock('@/providers/server/installationId', () => ({
  getInstallationId: () => 'install-1',
}));

const mockServerFetch = serverFetch as jest.MockedFunction<typeof serverFetch>;

const headersOf = (): Record<string, string> =>
  (mockServerFetch.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;

/**
 * Signing in to a MediaBrowser server, and the header the whole thing turns on.
 *
 * Jellyfin builds `AuthenticationRequest.App` from the *client identity
 * header*, never from the request body. Jellyfin 12 reads that identity from
 * the standard `Authorization` header and only falls back to
 * `X-Emby-Authorization` when `EnableLegacyAuthorization` is set — which
 * defaults to false and which 12 ships a migration to turn off on upgrade. So
 * an upgraded server read no identity at all from this app, and
 * `AuthenticateByName` threw `Value cannot be null. (Parameter 'request.App')`
 * before it ever considered the password.
 *
 * It read as a credentials problem and was not one, which is why the first fix
 * put an `App` field in the JSON body: the exception names a parameter, and a
 * parameter looks like something you pass. `AuthenticateUserByName` has no such
 * field, so it was ignored, and the test that pinned it passed while every
 * affected user stayed locked out.
 */
describe('MediaBrowser password authentication', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockServerFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ AccessToken: 'token', User: { Id: 'user-1' } }),
    } as Response);
  });

  it('signs in', async () => {
    await expect(connect(JELLYFIN_BRAND, 'https://music.example', 'zack', 'secret'))
      .resolves.toEqual({ success: true, token: 'token', userId: 'user-1' });
  });

  it('names the client in the standard Authorization header', async () => {
    await connect(JELLYFIN_BRAND, 'https://music.example', 'zack', 'secret');
    // `Client=` is what becomes `request.App`. Asserted by name because that
    // is the value whose absence produced the reported exception.
    expect(headersOf().Authorization).toContain('MediaBrowser');
    expect(headersOf().Authorization).toContain('Client="Yuzic"');
  });

  it('still sends the legacy header, for servers that only read that one', async () => {
    await connect(JELLYFIN_BRAND, 'https://music.example', 'zack', 'secret');
    expect(headersOf()['X-Emby-Authorization']).toContain('Client="Yuzic"');
  });

  /**
   * The body carries credentials and nothing else. An `App` field here is not
   * merely useless — it is a claim that the server reads it, and the last
   * person to believe that claim shipped a fix that could not work.
   */
  it('sends only the credentials in the body', async () => {
    await connect(JELLYFIN_BRAND, 'https://music.example', 'zack', 'secret');
    expect(mockServerFetch).toHaveBeenCalledWith(
      'https://music.example/Users/AuthenticateByName',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ Username: 'zack', Pw: 'secret' }),
      }),
    );
  });

  /**
   * Emby is left on the legacy header, which is what it asks for. There is no
   * reported problem there, and a shared fix that changed both would be a
   * change to a server nobody has complained about.
   */
  it('leaves Emby on the legacy header alone', async () => {
    await connect(EMBY_BRAND, 'https://media.example', 'zack', 'secret');
    expect(headersOf()['X-Emby-Authorization']).toContain('Client="Yuzic"');
    expect(headersOf().Authorization).toBeUndefined();
  });

  /**
   * A proxy demanding HTTP basic auth owns `Authorization`, and there is only
   * one of it. Those installs get the legacy header and need the server's
   * legacy switch turned back on — a real boundary, pinned here so it is a
   * known limitation rather than a surprise.
   */
  it('yields Authorization to basic auth, keeping the identity in the legacy header', async () => {
    await connect(JELLYFIN_BRAND, 'https://music.example', 'zack', 'secret', {
      username: 'proxy',
      password: 'pw',
    });
    expect(headersOf().Authorization).toBe('Basic ' + btoa('proxy:pw'));
    expect(headersOf()['X-Emby-Authorization']).toContain('Client="Yuzic"');
  });
});
