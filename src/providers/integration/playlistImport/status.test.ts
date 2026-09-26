import { fetchPlaylistStatus } from './status';

const mockRequest = jest.fn();
jest.mock('./client', () => ({
  createPlaylistImportClient: (config: unknown) => ({ request: mockRequest, baseUrl: (config as { serverUrl: string }).serverUrl }),
}));

describe('fetchPlaylistStatus', () => {
  beforeEach(() => mockRequest.mockReset());

  it('asks for the confirmed target_user query param', async () => {
    mockRequest.mockResolvedValue([]);

    await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(mockRequest).toHaveBeenCalledWith('/watchlist/playlist-status?target_user=christina');
  });

  it('URL-encodes a target_user with special characters', async () => {
    mockRequest.mockResolvedValue([]);

    await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'a user@x');

    expect(mockRequest).toHaveBeenCalledWith('/watchlist/playlist-status?target_user=a%20user%40x');
  });

  it('normalizes a bare array response', async () => {
    mockRequest.mockResolvedValue([
      {
        spotify_playlist_id: 'playlist-1',
        navidrome_playlist_id: 'nd-1',
        name: 'Road Trip',
        pending_tracks: [
          { spotify_id: 'track-1', position: 2, title: 'Song A', artist: 'Artist A', retry_expired: false },
        ],
      },
    ]);

    const result = await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(result).toEqual([
      {
        playlistId: 'playlist-1',
        navidromePlaylistId: 'nd-1',
        name: 'Road Trip',
        pending: [
          { spotifyId: 'track-1', position: 2, title: 'Song A', artist: 'Artist A', retryExpired: false },
        ],
      },
    ]);
  });

  it('normalizes a response wrapped in a "playlists" field', async () => {
    mockRequest.mockResolvedValue({
      playlists: [
        { spotify_playlist_id: 'playlist-2', pending_tracks: [] },
      ],
    });

    const result = await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(result).toEqual([
      { playlistId: 'playlist-2', navidromePlaylistId: null, name: null, pending: [] },
    ]);
  });

  it('drops a pending track missing an id, title, or artist rather than sending it on half-formed', async () => {
    mockRequest.mockResolvedValue([
      {
        spotify_playlist_id: 'playlist-1',
        pending_tracks: [
          { spotify_id: 'track-1', title: 'Has everything', artist: 'Artist A' },
          { spotify_id: 'track-2', title: 'No artist' },
          { title: 'No id', artist: 'Artist B' },
        ],
      },
    ]);

    const [result] = await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(result.pending).toEqual([
      { spotifyId: 'track-1', position: 0, title: 'Has everything', artist: 'Artist A', retryExpired: false },
    ]);
  });

  it('marks a track past the retry window as retryExpired', async () => {
    mockRequest.mockResolvedValue([
      {
        spotify_playlist_id: 'playlist-1',
        pending_tracks: [
          { spotify_id: 'track-1', title: 'Gave up', artist: 'Artist A', retry_expired: true },
        ],
      },
    ]);

    const [result] = await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(result.pending[0]).toMatchObject({ retryExpired: true });
  });

  it('drops a playlist with no recognizable id', async () => {
    mockRequest.mockResolvedValue([{ pending_tracks: [] }]);

    const result = await fetchPlaylistStatus({ serverUrl: 'http://nas:5001' }, 'christina');

    expect(result).toEqual([]);
  });
});
