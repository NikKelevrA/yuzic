import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

import { SearchProvider, useSearch } from './SearchContext';

// Library data hooks — enough of a shape for SearchContext to build its
// lowercased search index over.
jest.mock('@/features/album/useAlbums', () => ({ useAlbums: () => ({ albums: [] }) }));
jest.mock('@/features/artist/useArtists', () => ({ useArtists: () => ({ artists: [] }) }));
jest.mock('@/features/playlist/usePlaylists', () => ({ usePlaylists: () => ({ playlists: [] }) }));
jest.mock('@/features/song/useTracks', () => ({ useTracks: () => ({ tracks: [] }) }));

jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({ search: { search: jest.fn().mockResolvedValue({ albums: [], artists: [], songs: [] }) } }),
}));

jest.mock('@/features/offline/DownloadContext', () => ({
  useDownload: () => ({
    downloadedTracks: [],
    getAllDownloadedCollections: () => [],
  }),
}));

let mockIsOffline = false;
jest.mock('@/features/connectivity/useIsOffline', () => ({
  useIsOffline: () => mockIsOffline,
}));

let mockServerUnreachable = false;
jest.mock('@/features/connectivity/serverReachability', () => ({
  useServerUnreachable: () => mockServerUnreachable,
}));

// Domain-shaped fixtures — `searchDeezerArtists`/`searchDeezerAlbums` return
// domain `Artist`/`Album` now, not the pre-rewrite flat `{id, artist: string}`
// shape.
const dzAlbum = {
  localId: 'local:album:ext:deezer:dz-1',
  nativeId: 'dz-1',
  provenance: { origin: 'integration', providerId: 'deezer' },
  externalIds: { deezerId: 'dz-1' },
  libraryState: 'external',
  title: 'Rumours',
  cover: { kind: 'none' },
  artist: {
    localId: 'local:artist:ext:deezer:fm-1',
    nativeId: 'fm-1',
    name: 'Fleetwood Mac',
    cover: { kind: 'none' },
    externalIds: { deezerId: 'fm-1' },
  },
  releaseType: 'album',
  genres: [],
  songIds: [],
};

const mockSearchDeezerArtists = jest.fn().mockResolvedValue([]);
const mockSearchDeezerAlbums = jest.fn().mockResolvedValue([dzAlbum]);
jest.mock('@/providers/integration/deezer', () => ({
  searchDeezerArtists: (...args: unknown[]) => mockSearchDeezerArtists(...args),
  searchDeezerAlbums: (...args: unknown[]) => mockSearchDeezerAlbums(...args),
}));

const mockSearchArtist = jest.fn().mockResolvedValue([]);
const mockSearchReleaseGroupByTitle = jest.fn().mockResolvedValue([
  { id: 'mb-1', title: 'Rumours', 'first-release-date': '1977-02-04' },
]);
jest.mock('@/providers/integration/musicbrainz', () => ({
  searchArtist: (...args: unknown[]) => mockSearchArtist(...args),
  searchReleaseGroupByTitle: (...args: unknown[]) => mockSearchReleaseGroupByTitle(...args),
}));

let mockSearchScope: 'client' | 'server' = 'server';
jest.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({
    settingsSearch: { searchScope: mockSearchScope },
  }),
}));
jest.mock('@/features/settings/search/state', () => ({
  selectSearchScope: (s: { settingsSearch: { searchScope: string } }) => s.settingsSearch.searchScope,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <SearchProvider>{children}</SearchProvider>;
}

describe('SearchContext handleSearchWithFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOffline = false;
    mockServerUnreachable = false;
    mockSearchDeezerArtists.mockResolvedValue([]);
    mockSearchDeezerAlbums.mockResolvedValue([dzAlbum]);
    mockSearchArtist.mockResolvedValue([]);
    mockSearchReleaseGroupByTitle.mockResolvedValue([
      { id: 'mb-1', title: 'Rumours', 'first-release-date': '1977-02-04' },
    ]);
  });

  it('never calls an external source for the default library scope', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'library',
        sourceIds: ['deezer'],
      });
    });

    expect(mockSearchDeezerAlbums).not.toHaveBeenCalled();
    expect(mockSearchReleaseGroupByTitle).not.toHaveBeenCalled();
    // Only the library/server leg's results, never external ones.
    expect(result.current.searchResults.every(r => r.source === 'local')).toBe(true);
  });

  it('queries the enabled source when scope is "other"', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['deezer'],
      });
    });

    expect(mockSearchDeezerAlbums).toHaveBeenCalledWith('rumours', 6);
    expect(mockSearchReleaseGroupByTitle).not.toHaveBeenCalled();
  });

  it('never mixes library and external results in one response', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['deezer'],
      });
    });

    expect(result.current.searchResults.length).toBeGreaterThan(0);
    expect(result.current.searchResults.every(r => r.source === 'external')).toBe(true);
  });

  it('preserves provenance per source and keeps editions from different sources separate', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['deezer', 'musicbrainz'],
      });
    });

    const sources = result.current.searchResults.map(r => r.externalSource);
    expect(sources).toContain('deezer');
    expect(sources).toContain('musicbrainz');
    // Two distinct records for the same album title, one per source — not
    // collapsed into a single merged row.
    expect(result.current.searchResults.filter(r => r.type === 'album')).toHaveLength(2);
  });

  it("the Filters selection limits which sources are queried", async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['musicbrainz'],
      });
    });

    expect(mockSearchDeezerAlbums).not.toHaveBeenCalled();
    expect(mockSearchReleaseGroupByTitle).toHaveBeenCalled();
  });

  it('the Filters entity-type selection limits which entity types are asked for', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['deezer'],
        entityTypes: ['artist'],
      });
    });

    expect(mockSearchDeezerAlbums).not.toHaveBeenCalled();
  });

  it('marks external results as degraded rather than errored when offline', async () => {
    mockIsOffline = true;
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'other',
        sourceIds: ['deezer'],
      });
    });

    expect(mockSearchDeezerAlbums).not.toHaveBeenCalled();
    expect(result.current.degraded).toBe(true);
    expect(result.current.hasError).toBe(false);
  });

  it('does nothing for an empty query', async () => {
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('   ', {
        resultScope: 'other',
        sourceIds: ['deezer'],
      });
    });

    expect(mockSearchDeezerAlbums).not.toHaveBeenCalled();
    expect(result.current.searchResults).toEqual([]);
  });

  it('falls back to the local index for the library scope when the server is unreachable', async () => {
    mockServerUnreachable = true;
    mockSearchScope = 'server';
    const { result } = await renderHook(() => useSearch(), { wrapper });

    await act(async () => {
      await result.current.handleSearchWithFilters('rumours', {
        resultScope: 'library',
        sourceIds: [],
      });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.degraded).toBe(true);
  });
});
