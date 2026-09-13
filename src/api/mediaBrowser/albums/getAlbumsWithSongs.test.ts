import { getAlbumsWithSongs } from './getAlbumsWithSongs';
import { MediaBrowserClient } from '../client';
import { JELLYFIN_BRAND, EMBY_BRAND } from '../brand';

const rawAlbum = {
  Id: 'album-1',
  Name: 'Album One',
  ArtistItems: [{ Id: 'artist-1', Name: 'Artist One' }],
  ImageTags: { Primary: 'tag-abc' },
};

const rawSong = {
  Id: 'song-1',
  Name: 'Song One',
  AlbumId: 'album-1',
  ArtistItems: [{ Id: 'artist-1', Name: 'Artist One' }],
  RunTimeTicks: 20_000_000,
};

function makeClient(brand: typeof JELLYFIN_BRAND | typeof EMBY_BRAND): MediaBrowserClient {
  const request = jest.fn((path: string) => {
    if (path.includes('IncludeItemTypes=Audio')) return Promise.resolve({ Items: [rawSong] });
    return Promise.resolve({ Items: [rawAlbum] });
  });
  return {
    request,
    requestText: jest.fn(),
    serverUrl: 'https://server.example',
    serverId: 'server-1',
    token: 'tok',
    userId: 'user-1',
    parentId: undefined,
    buildStreamUrl: jest.fn(),
    brand,
  } as unknown as MediaBrowserClient;
}

describe('getAlbumsWithSongs', () => {
  it('gives songs the album title via their album reference for jellyfin', async () => {
    const details = await getAlbumsWithSongs(makeClient(JELLYFIN_BRAND));
    expect(details[0].songs[0].album.title).toBe('Album One');
  });

  // Matches the pre-rewrite behaviour: emby's bulk listing never resolved an
  // album title onto the song, so its album reference falls back to
  // "Unknown Album" rather than the real title — the same gap, just now
  // visible on `song.album.title` instead of a since-removed `albumTitle`.
  it('falls back to "Unknown Album" on the song reference for emby (matches existing emby behavior)', async () => {
    const details = await getAlbumsWithSongs(makeClient(EMBY_BRAND));
    expect(details[0].songs[0].album.title).toBe('Unknown Album');
  });

  it('gives jellyfin the nested artist cover but gives emby none', async () => {
    // Jellyfin resolves artist art from the item id alone, so the album payload
    // already carries everything the cover needs; Emby requires an image tag
    // this endpoint does not return, and honestly has none. The distinction
    // matters because `{ kind: 'none' }` is not nullish: a consumer written as
    // `album.artist.cover ?? song.cover` does not fall through it.
    const jellyfinDetails = await getAlbumsWithSongs(makeClient(JELLYFIN_BRAND));
    expect(jellyfinDetails[0].album.artist.cover).toEqual({ kind: 'jellyfin', itemId: 'artist-1' });

    const embyDetails = await getAlbumsWithSongs(makeClient(EMBY_BRAND));
    expect(embyDetails[0].album.artist.cover).toEqual({ kind: 'none' });
  });
});
