import { getAlbumList } from './getAlbumList';
import { NavidromeClient } from '../client';
import { SubsonicResponse } from '../types';
import { serverProvenance } from '@/domain/identity/Provenance';

const provenance = serverProvenance('server-1');

function makeClient(pages: SubsonicResponse[]): NavidromeClient {
  const request = jest.fn();
  pages.forEach((page) => request.mockResolvedValueOnce(page));
  return {
    request,
    buildStreamUrl: jest.fn(),
    serverUrl: 'https://server.example',
    serverId: 'server-1',
    username: 'user',
    password: 'pass',
  } as unknown as NavidromeClient;
}

describe('getAlbumList', () => {
  it('maps each entry through the shared album mapper', async () => {
    const client = makeClient([
      {
        'subsonic-response': {
          albumList: {
            album: [{ id: 'album-1', title: 'Album One', artist: 'Artist One', artistId: 'artist-1' }],
          },
        },
      },
    ]);

    const albums = await getAlbumList(client, provenance);
    expect(albums).toHaveLength(1);
    expect(albums[0]).toMatchObject({
      localId: 'local:album:srv:server-1:album-1',
      title: 'Album One',
    });
  });

  it('falls back to sensible defaults when fields are missing, via the shared mapper', async () => {
    const client = makeClient([
      { 'subsonic-response': { albumList: { album: [{}] } } },
    ]);

    const albums = await getAlbumList(client, provenance);
    expect(albums[0]).toMatchObject({
      nativeId: '',
      title: 'Unknown Album',
      year: undefined,
      cover: { kind: 'none' },
    });
  });

  it('pages through the full list at 500 per request', async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => ({ id: `album-${i}`, title: `Album ${i}` }));
    const client = makeClient([
      { 'subsonic-response': { albumList: { album: fullPage } } },
      { 'subsonic-response': { albumList: { album: [] } } },
    ]);

    const albums = await getAlbumList(client, provenance);
    expect(albums).toHaveLength(500);
    expect(client.request).toHaveBeenCalledTimes(2);
  });
});
