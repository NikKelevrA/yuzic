import { getAlbum } from './getAlbum';
import { NavidromeClient } from '../client';
import { SubsonicResponse } from '../types';
import { serverProvenance } from '@/domain/identity/Provenance';

jest.mock('./getAlbumInfo', () => ({
  getAlbumInfo: jest.fn().mockResolvedValue({ notes: '', musicBrainzId: null, lastFmUrl: null }),
}));

function makeClient(response: SubsonicResponse): NavidromeClient {
  return {
    request: jest.fn().mockResolvedValue(response),
    buildStreamUrl: jest.fn().mockReturnValue('https://server.example/stream'),
    serverUrl: 'https://server.example',
    serverId: 'server-1',
    username: 'user',
    password: 'pass',
  } as unknown as NavidromeClient;
}

const provenance = serverProvenance('server-1');

describe('getAlbum', () => {
  it('returns song duration as a number, not a formatted string', async () => {
    const client = makeClient({
      'subsonic-response': {
        album: {
          id: 'album-1',
          name: 'Album One',
          artistId: 'artist-1',
          song: [{ id: 'song-1', title: 'Song One', artist: 'Artist One', duration: 215 }],
        },
      },
    });

    const result = await getAlbum(client, 'album-1', provenance);
    expect(result?.songs[0].durationSeconds).toBe(215);
    expect(typeof result?.songs[0].durationSeconds).toBe('number');
  });

  it('falls back to Unknown Artist/Unknown for missing song metadata', async () => {
    const client = makeClient({
      'subsonic-response': {
        album: {
          id: 'album-1',
          name: 'Album One',
          artistId: 'artist-1',
          song: [{ id: 'song-1' }],
        },
      },
    });

    const result = await getAlbum(client, 'album-1', provenance);
    expect(result?.songs[0].artist.name).toBe('Unknown Artist');
    expect(result?.songs[0].title).toBe('Unknown');
  });

  it('derives a stable localId from the given provenance', async () => {
    const client = makeClient({
      'subsonic-response': {
        album: {
          id: 'album-1',
          name: 'Album One',
          artistId: 'artist-1',
          song: [{ id: 'song-1', title: 'Song One', artist: 'Artist One', duration: 200 }],
        },
      },
    });

    const result = await getAlbum(client, 'album-1', provenance);
    expect(result?.album.localId).toBe('local:album:srv:server-1:album-1');
    expect(result?.album.artist.localId).toBe('local:artist:srv:server-1:artist-1');
    expect(result?.songs[0].localId).toBe('local:song:srv:server-1:song-1');

    // Stable: fetching the same album twice from the same server produces the same localId.
    const again = await getAlbum(client, 'album-1', provenance);
    expect(again?.album.localId).toBe(result?.album.localId);
  });

  it("keeps the album's songIds in agreement with the detail's mapped songs", async () => {
    const client = makeClient({
      'subsonic-response': {
        album: {
          id: 'album-1',
          name: 'Album One',
          artistId: 'artist-1',
          song: [
            { id: 'song-1', title: 'Song One' },
            { id: 'song-2', title: 'Song Two' },
          ],
        },
      },
    });

    const result = await getAlbum(client, 'album-1', provenance);
    expect(result?.album.songIds).toEqual(result?.songs.map((s) => s.localId));
  });
});
