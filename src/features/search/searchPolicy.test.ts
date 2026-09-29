import { searchLibraryLeg, searchServerLeg, searchPlaylistIndexLeg, searchExternalLeg, type SearchIndex, type DownloadedIds } from './searchPolicy';

// Two keyless catalogues that can search, one of which is over its rate limit.
// `searchExternalLeg` asks the broker for `catalogue.search`, so these stand in
// for Deezer and MusicBrainz without either network.
jest.mock('@/providers/registry/keyless', () => {
  const found = (id: string) => ({
    artists: [],
    albums: [{ entity: { nativeId: `${id}-album`, title: `${id} album`, cover: { kind: 'none' }, externalIds: {} }, subtitle: 'Artist' }],
  });
  const provider = (id: string, search: () => Promise<unknown>) => ({
    kind: 'integration', id, presentation: { nameKey: id, icon: 0, color: '#000' }, auth: { tier: 'none' },
    capabilities: { 'catalogue.search': search },
    testConnection: async () => ({ ok: true }),
  });
  return {
    KEYLESS_INTEGRATIONS: [
      provider('healthy', async () => found('healthy')),
      provider('limited', async () => { throw new Error('MusicBrainz 503'); }),
    ],
  };
});

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

describe('searchPlaylistIndexLeg', () => {
  const index: SearchIndex = {
    ...emptyIndex,
    playlists: [
      { item: { nativeId: 'p-1', title: 'Road Trip' } as any, lc: 'road trip' },
      { item: { nativeId: 'p-2', title: 'Rainy Day' } as any, lc: 'rainy day' },
    ],
  };

  it('matches case-insensitively and marks downloaded state', () => {
    const results = searchPlaylistIndexLeg(index, 'ROAD', { ...emptyDownloaded, playlists: new Set(['p-1']) });

    expect(results).toEqual([
      expect.objectContaining({ id: 'p-1', type: 'playlist', source: 'local', isDownloaded: true }),
    ]);
  });

  // The regression this exists for: a server-scoped search runs this leg
  // beside the server's own results, because no SearchApi returns playlists
  // and Subsonic's search3 has none in its response at all.
  it('is what searchLibraryLeg uses for its playlist rows', () => {
    const viaLibrary = searchLibraryLeg(index, 'rainy', emptyDownloaded);
    const viaLeg = searchPlaylistIndexLeg(index, 'rainy', emptyDownloaded);

    expect(viaLeg).toHaveLength(1);
    expect(viaLibrary).toEqual(viaLeg);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchPlaylistIndexLeg(index, 'nothing', emptyDownloaded)).toEqual([]);
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

  // One source over its rate limit used to reject the whole leg, so the other
  // source's results were thrown away and the screen showed an error instead.
  it('keeps the results of the sources that answered when one fails', async () => {
    const results = await searchExternalLeg(['healthy', 'limited'], 'rumours', ['album', 'artist']);
    expect(results.map(r => r.id)).toEqual(['healthy-album']);
  });

  it('still fails when no source answered at all', async () => {
    await expect(searchExternalLeg(['limited'], 'rumours', ['album', 'artist'])).rejects.toThrow('MusicBrainz 503');
  });
});
