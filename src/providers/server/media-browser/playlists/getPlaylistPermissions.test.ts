import type { MediaBrowserClient } from '../client';
import { JELLYFIN_BRAND, EMBY_BRAND } from '../brand';
import { MediaBrowserRequestError } from '../requestError';
import { getPlaylistPermissions } from './getPlaylistPermissions';

const ME = '0b9f4a1c-2d3e-4f50-8a9b-c1d2e3f4a5b6';

function clientWith(brand = JELLYFIN_BRAND, answers: Record<string, unknown | Error> = {}) {
  const request = jest.fn(async (path: string) => {
    const answer = answers[path];
    if (answer instanceof Error) throw answer;
    return answer ?? {};
  });
  // The client writes the user id without dashes; shares carry them.
  return { client: { brand, userId: ME.replace(/-/g, ''), request } as unknown as MediaBrowserClient, request };
}

const notFound = () => new MediaBrowserRequestError('Jellyfin', 404, 'User permissions not found');
const me = `/Playlists/p1/Users/${ME.replace(/-/g, '')}`;

describe('getPlaylistPermissions', () => {
  it('reads the owner as owning and editing', async () => {
    const { client } = clientWith(JELLYFIN_BRAND, { '/Playlists/p1': { Shares: [] }, [me]: { CanEdit: true } });

    await expect(getPlaylistPermissions(client, 'p1')).resolves.toEqual({ isOwned: true, canEdit: true });
  });

  it('reads an account shared with edit rights as editing without owning', async () => {
    const { client } = clientWith(JELLYFIN_BRAND, {
      '/Playlists/p1': { Shares: [{ UserId: ME, CanEdit: true }] },
      [me]: { CanEdit: true },
    });

    await expect(getPlaylistPermissions(client, 'p1')).resolves.toEqual({ isOwned: false, canEdit: true });
  });

  it("reads someone else's public playlist as neither", async () => {
    const { client } = clientWith(JELLYFIN_BRAND, { '/Playlists/p1': { Shares: [] }, [me]: notFound() });

    await expect(getPlaylistPermissions(client, 'p1')).resolves.toEqual({ isOwned: false, canEdit: false });
  });

  it('cannot say on a Jellyfin without shared playlists, or on Emby, and asks Emby nothing', async () => {
    const old = clientWith(JELLYFIN_BRAND, { '/Playlists/p1': notFound() });
    await expect(getPlaylistPermissions(old.client, 'p1')).resolves.toBeNull();

    const emby = clientWith(EMBY_BRAND);
    await expect(getPlaylistPermissions(emby.client, 'p1')).resolves.toBeNull();
    expect(emby.request).not.toHaveBeenCalled();
  });

  it('cannot say when the permission lookup itself fails', async () => {
    const { client } = clientWith(JELLYFIN_BRAND, { '/Playlists/p1': { Shares: [] }, [me]: new Error('Network request failed') });

    await expect(getPlaylistPermissions(client, 'p1')).resolves.toBeNull();
  });
});
