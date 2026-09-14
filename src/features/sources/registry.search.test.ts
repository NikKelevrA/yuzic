/**
 * `search()` is the one capability Search's "Other sources" scope calls —
 * see `src/features/search/searchPolicy.ts#searchExternalLeg`, which loops
 * over `ALL_SOURCES` and calls this generically, naming no source by name.
 * These tests cover what each source's own `search()` does with the raw API
 * responses, the same shape `SearchContext.test.tsx` used to assert through
 * the old `SearchContext#searchExternalSource` branch.
 */
const mockSearchDeezerArtists = jest.fn();
const mockSearchDeezerAlbums = jest.fn();
jest.mock('@/providers/integration/deezer', () => ({
  searchDeezerArtists: (...args: unknown[]) => mockSearchDeezerArtists(...args),
  searchDeezerAlbums: (...args: unknown[]) => mockSearchDeezerAlbums(...args),
}));

const mockSearchArtist = jest.fn();
const mockSearchReleaseGroupByTitle = jest.fn();
jest.mock('@/providers/integration/musicbrainz', () => ({
  searchArtist: (...args: unknown[]) => mockSearchArtist(...args),
  searchReleaseGroupByTitle: (...args: unknown[]) => mockSearchReleaseGroupByTitle(...args),
}));

import { ALL_SOURCES } from './registry';

const deezer = ALL_SOURCES.find(s => s.id === 'deezer')!;
const musicbrainz = ALL_SOURCES.find(s => s.id === 'musicbrainz')!;

describe('deezerSource.search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tags every result with its own source id', async () => {
    mockSearchDeezerArtists.mockResolvedValue([]);
    mockSearchDeezerAlbums.mockResolvedValue([
      { nativeId: 'dz-1', title: 'Rumours', cover: { kind: 'none' }, artist: { name: 'Fleetwood Mac', externalIds: {} }, externalIds: { deezerId: 'dz-1' } },
    ]);

    const results = await deezer.search('rumours', { artists: true, albums: true });

    expect(results.albums).toEqual([
      expect.objectContaining({ source: 'deezer', id: 'dz-1', title: 'Rumours', subtitle: 'Fleetwood Mac' }),
    ]);
  });

  it('skips a leg the caller did not ask for', async () => {
    mockSearchDeezerAlbums.mockResolvedValue([]);
    await deezer.search('rumours', { artists: false, albums: true });
    expect(mockSearchDeezerArtists).not.toHaveBeenCalled();
    expect(mockSearchDeezerAlbums).toHaveBeenCalledWith('rumours', 6);
  });
});

describe('musicbrainzSource.search', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tags every result with its own source id, using the release year as subtitle', async () => {
    mockSearchArtist.mockResolvedValue([]);
    mockSearchReleaseGroupByTitle.mockResolvedValue([
      { id: 'mb-1', title: 'Rumours', 'first-release-date': '1977-02-04' },
    ]);

    const results = await musicbrainz.search('rumours', { artists: true, albums: true });

    expect(results.albums).toEqual([
      expect.objectContaining({ source: 'musicbrainz', id: 'mb-1', title: 'Rumours', subtitle: '1977' }),
    ]);
  });

  it('skips a leg the caller did not ask for', async () => {
    mockSearchArtist.mockResolvedValue([]);
    await musicbrainz.search('rumours', { artists: true, albums: false });
    expect(mockSearchReleaseGroupByTitle).not.toHaveBeenCalled();
    expect(mockSearchArtist).toHaveBeenCalledWith('rumours', 4);
  });
});
