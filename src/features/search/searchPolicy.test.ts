import { searchLibraryLeg, searchServerLeg, searchExternalLeg, type SearchIndex, type DownloadedIds } from './searchPolicy';

const emptyDownloaded: DownloadedIds = { tracks: new Set(), albums: new Set(), playlists: new Set() };

const emptyIndex: SearchIndex = { tracks: [], albums: [], artists: [], playlists: [] };

describe('searchLibraryLeg', () => {
  it('matches case-insensitively across all four kinds and marks downloaded state', () => {
    const index: SearchIndex = {
      ...emptyIndex,
      albums: [{ item: { nativeId: 'a-1', title: 'Rumours', artist: { name: 'Fleetwood Mac' } } as any, lc: 'rumours' }],
      tracks: [{ item: { nativeId: 't-1', title: 'The Chain', artist: { name: 'Fleetwood Mac' } } as any, lc: 'the chain fleetwood mac' }],
    };
    const results = searchLibraryLeg(index, 'RUMOURS', { ...emptyDownloaded, albums: new Set(['a-1']) });
    expect(results).toEqual([
      expect.objectContaining({ id: 'a-1', type: 'album', source: 'local', isDownloaded: true }),
    ]);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchLibraryLeg(emptyIndex, 'nothing', emptyDownloaded)).toEqual([]);
  });
});

describe('searchServerLeg', () => {
  it('returns nothing without an api client', async () => {
    expect(await searchServerLeg(undefined, 'rumours', emptyDownloaded)).toEqual([]);
  });

  it('maps the server response into local-source results', async () => {
    const api = {
      search: jest.fn().mockResolvedValue({
        albums: [{ nativeId: 'a-1', title: 'Rumours', artist: { name: 'Fleetwood Mac' } }],
        artists: [],
        songs: [],
      }),
    };
    const results = await searchServerLeg(api as any, 'rumours', emptyDownloaded);
    expect(results).toEqual([expect.objectContaining({ id: 'a-1', type: 'album', source: 'local' })]);
  });
});

describe('searchExternalLeg', () => {
  it('returns nothing for an empty query or no selected sources', async () => {
    expect(await searchExternalLeg(['deezer'], '   ', ['album', 'artist'])).toEqual([]);
    expect(await searchExternalLeg([], 'rumours', ['album', 'artist'])).toEqual([]);
  });
});
