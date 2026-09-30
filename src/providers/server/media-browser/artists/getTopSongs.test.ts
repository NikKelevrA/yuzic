import { getTopSongs } from './getTopSongs';
import { MediaBrowserClient } from '../client';
import { JELLYFIN_BRAND } from '../brand';

function makeClient(overrides: Partial<MediaBrowserClient> = {}): MediaBrowserClient {
  return {
    request: jest.fn().mockResolvedValue({ Items: [] }),
    requestText: jest.fn(),
    serverUrl: 'https://server.example',
    serverId: 'server-1',
    token: 'tok',
    userId: 'user-1',
    parentId: undefined,
    buildStreamUrl: jest.fn(),
    brand: JELLYFIN_BRAND,
    ...overrides,
  } as MediaBrowserClient;
}

function audioItem(id: string, name: string, playCount?: number) {
  return {
    Id: id,
    Name: name,
    AlbumId: 'alb-1',
    Album: 'An Album',
    ArtistItems: [{ Id: 'art-1', Name: 'The Artist' }],
    RunTimeTicks: 2_000_000_000,
    ...(playCount === undefined ? {} : { UserData: { PlayCount: playCount } }),
  };
}

describe('getTopSongs (MediaBrowser)', () => {
  it('asks for the artist by name, ranked by play count, within the limit', async () => {
    const request = jest.fn().mockResolvedValue({ Items: [] });
    await getTopSongs(makeClient({ request }), 'The Artist', 5);

    const path = request.mock.calls[0][0] as string;
    expect(path).toContain('/Users/user-1/Items');
    expect(path).toContain('IncludeItemTypes=Audio');
    expect(path).toContain('Artists=The%20Artist');
    expect(path).toContain('SortBy=PlayCount');
    expect(path).toContain('SortOrder=Descending');
    expect(path).toContain('Limit=5');
  });

  it('maps played songs through the shared song mapper', async () => {
    const request = jest.fn().mockResolvedValue({
      Items: [audioItem('s1', 'Most Played', 12), audioItem('s2', 'Less Played', 3)],
    });

    const songs = await getTopSongs(makeClient({ request }), 'The Artist');

    expect(songs.map(s => s.title)).toEqual(['Most Played', 'Less Played']);
    expect(songs[0].serverPlayCount).toBe(12);
  });

  // `SortBy=PlayCount` against a library nobody has played returns the whole
  // discography in no meaningful order; the section reading this hides itself
  // on an empty result, which is the honest answer for an account with
  // nothing to rank.
  it('drops tracks the account has never played', async () => {
    const request = jest.fn().mockResolvedValue({
      Items: [audioItem('s1', 'Played', 4), audioItem('s2', 'Never', 0), audioItem('s3', 'Unknown')],
    });

    const songs = await getTopSongs(makeClient({ request }), 'The Artist');

    expect(songs.map(s => s.title)).toEqual(['Played']);
  });

  it('asks nothing at all without an artist name', async () => {
    const request = jest.fn();
    const songs = await getTopSongs(makeClient({ request }), '');

    expect(songs).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  // One empty shelf rather than a failed artist page.
  it('returns nothing when the request fails', async () => {
    const request = jest.fn().mockRejectedValue(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getTopSongs(makeClient({ request }), 'The Artist')).resolves.toEqual([]);
  });
});
