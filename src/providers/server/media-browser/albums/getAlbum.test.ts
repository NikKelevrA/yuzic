import { getAlbum } from './getAlbum';
import { MediaBrowserClient } from '../client';
import { JELLYFIN_BRAND } from '../brand';

const rawAlbum = {
  Id: 'album-1',
  Name: 'Album One',
  ArtistItems: [{ Id: 'artist-1', Name: 'Artist One' }],
  ProductionYear: 2020,
  PremiereDate: '2020-03-04T00:00:00.000Z',
  Genres: ['Rock'],
  DateCreated: '2020-01-01T00:00:00Z',
  ImageTags: { Primary: 'tag-abc' },
};

function makeClient(request: jest.Mock): MediaBrowserClient {
  return {
    request,
    requestText: jest.fn(),
    serverUrl: 'https://server.example',
    serverId: 'server-1',
    token: 'tok',
    userId: 'user-1',
    parentId: undefined,
    buildStreamUrl: jest.fn(),
    brand: JELLYFIN_BRAND,
  } as unknown as MediaBrowserClient;
}

describe('getAlbum', () => {
  // `mapAlbum` reads `PremiereDate`, and the discography ordering reads the
  // `releaseDate` it produces — so a field list that omits it leaves every
  // album undated without anything failing.
  it('asks for PremiereDate, so the mapped album carries a release date', async () => {
    const request = jest.fn(async (path: string) =>
      path.includes('MusicAlbum') ? { Items: [rawAlbum] } : { Items: [] }
    );
    const result = await getAlbum(makeClient(request as unknown as jest.Mock), 'album-1');

    expect(request.mock.calls[0][0]).toContain('PremiereDate');
    expect(result?.album.releaseDate).toBe('2020-03-04T00:00:00.000Z');
  });
});
