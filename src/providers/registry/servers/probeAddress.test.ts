const mockServerFetch = jest.fn();

jest.mock('@/features/mtls/serverFetch', () => ({
  serverFetch: (...args: unknown[]) => mockServerFetch(...args),
}));

import { probeAddress as probeSubsonic } from '@/providers/server/navidrome/auth/probeAddress';
import { probeAddress as probeMediaBrowser } from '@/providers/server/media-browser/auth/probeAddress';
import { probeAddress as probePlex } from '@/providers/server/plex/auth/probeAddress';
import { EMBY_BRAND, JELLYFIN_BRAND } from '@/providers/server/media-browser/brand';

const answer = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

const webPage = '<!doctype html><title>My router</title>';

beforeEach(() => mockServerFetch.mockReset());

describe('address probes', () => {
  describe('Subsonic', () => {
    it("knows a Subsonic server by its refusal envelope, and asks its ping endpoint", async () => {
      mockServerFetch.mockReturnValue(answer({ 'subsonic-response': { status: 'failed', error: { code: 10 } } }));

      await expect(probeSubsonic('https://music.example/')).resolves.toEqual({ kind: 'ok' });
      expect(mockServerFetch.mock.calls[0][0]).toMatch(/^https:\/\/music\.example\/rest\/ping\.view\?/);
    });

    it('tells an ordinary web page apart from a server', async () => {
      mockServerFetch.mockReturnValue(answer(webPage));

      await expect(probeSubsonic('https://music.example')).resolves.toEqual({ kind: 'notThisServer' });
    });

    it('says nothing answered, and lets a proxy asking for sign-in through', async () => {
      mockServerFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
      await expect(probeSubsonic('https://nowhere.example')).resolves.toEqual({ kind: 'unreachable' });

      mockServerFetch.mockReturnValueOnce(answer('Unauthorized', 401));
      await expect(probeSubsonic('https://proxied.example')).resolves.toEqual({ kind: 'ok' });
    });
  });

  describe('Jellyfin and Emby', () => {
    it('accepts the brand that was chosen', async () => {
      mockServerFetch.mockReturnValue(answer({ Id: 'abc', ProductName: 'Jellyfin Server' }));

      await expect(probeMediaBrowser(JELLYFIN_BRAND, 'https://jf.example')).resolves.toEqual({ kind: 'ok' });
      expect(mockServerFetch).toHaveBeenCalledWith('https://jf.example/System/Info/Public');
    });

    it('catches a Jellyfin address entered as Emby', async () => {
      mockServerFetch.mockReturnValue(answer({ Id: 'abc', ProductName: 'Jellyfin Server' }));

      await expect(probeMediaBrowser(EMBY_BRAND, 'https://jf.example')).resolves.toEqual({ kind: 'notThisServer' });
    });

    it('tells a web page apart from a server', async () => {
      mockServerFetch.mockReturnValue(answer(webPage));

      await expect(probeMediaBrowser(JELLYFIN_BRAND, 'https://jf.example')).resolves.toEqual({ kind: 'notThisServer' });
    });
  });

  describe('Plex', () => {
    it('knows Plex by its machine identifier', async () => {
      mockServerFetch.mockReturnValue(answer({ MediaContainer: { machineIdentifier: 'mid' } }));

      await expect(probePlex('https://plex.example:32400')).resolves.toEqual({ kind: 'ok' });
    });

    it('tells a web page apart, and says when nothing answered', async () => {
      mockServerFetch.mockReturnValueOnce(answer(webPage));
      await expect(probePlex('https://plex.example')).resolves.toEqual({ kind: 'notThisServer' });

      mockServerFetch.mockRejectedValueOnce(new TypeError('Network request failed'));
      await expect(probePlex('https://plex.example')).resolves.toEqual({ kind: 'unreachable' });
    });
  });
});
