import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
  useRef,
} from 'react';

import { useAlbums } from '@/features/album/useAlbums';
import { useArtists } from '@/features/artist/useArtists';
import { usePlaylists } from '@/features/playlist/usePlaylists';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useServerUnreachable } from '@/features/connectivity/serverReachability';

import { useTracks } from '@/features/song/useTracks';
import { useApi } from '@/providers/registry/useApi';
import { useSelector } from 'react-redux';
import { selectSearchScope } from '@/features/settings/search/state';
import { useDownload } from '@/features/offline/DownloadContext';
import {
  buildDownloadedTrackIdSet,
  getFullyDownloadedAlbumIds,
} from '@/utils/downloads/collectionState';

import { dedupeAndSort, type SearchResult } from '@/features/search/searchRanking';
import { planSearchLegs, type SearchResultScope } from '@/features/search/searchLegs';
import {
  searchLibraryLeg,
  searchServerLeg,
  searchExternalLeg,
  ALL_SEARCH_ENTITY_TYPES,
  type SearchEntityType,
  type SearchIndex,
  type DownloadedIds,
} from '@/features/search/searchPolicy';

export type { SearchResult } from '@/features/search/searchRanking';
export type { SearchResultScope } from '@/features/search/searchLegs';
export type { SearchEntityType } from '@/features/search/searchPolicy';

export type SearchFilters = {
  /** 'library' (default) — today's local search — or 'other', the
   *  deliberate external-search action. The two are never both attempted
   *  in the same request; that split is what keeps library and external
   *  results from mixing by default. */
  resultScope: SearchResultScope;
  /** Source ids to query when `resultScope` is 'other' — the sources the
   *  Filters sheet left checked, already narrowed to ones enabled for
   *  search. Ignored when `resultScope` is 'library'. */
  sourceIds: string[];
  /** Which entity types to ask each external source for. Defaults to all
   *  supported types when omitted. Ignored when `resultScope` is 'library'. */
  entityTypes?: SearchEntityType[];
};

interface SearchContextType {
  searchResults: SearchResult[];
  clearSearch: () => void;
  isLoading: boolean;
  /** True when the most recent search failed to reach the server/external source, so results shown (if any) may be incomplete. */
  hasError: boolean;
  /**
   * True when the remote legs of the search were deliberately skipped because
   * the server can't be reached, so what's shown is the local library only.
   * Distinct from `hasError`: nothing failed, it was never attempted.
   */
  degraded: boolean;
  handleSearchWithFilters: (query: string, filters: SearchFilters) => Promise<void>;
}

interface SearchProviderProps {
  children: ReactNode;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const api = useApi();
  const { albums } = useAlbums();
  const { artists } = useArtists();
  const { playlists } = usePlaylists();
  const { tracks } = useTracks();

  const searchScope = useSelector(selectSearchScope);

  // Whether the remote halves of a search can be attempted at all. Offline is
  // the device having no network; serverUnreachable is the device being online
  // while the music server isn't (VPN down, server rebooting) — the case that
  // otherwise leaves every keystroke hanging until its own timeout.
  const isOffline = useIsOffline();
  const serverUnreachable = useServerUnreachable();
  const canReachServer = !isOffline && !serverUnreachable;
  // External sources are public APIs, so they only need the device to be
  // online — an unreachable *music server* says nothing about whether they're up.
  const canReachExternal = !isOffline;

  const { downloadedTracks, getAllDownloadedCollections } = useDownload();

  const downloadedTrackIds = useMemo(
    () => buildDownloadedTrackIdSet(
      downloadedTracks
        .map(track => ({ id: String(track.trackId ?? track.originalTrack?.id ?? '') }))
        .filter(track => track.id)
    ),
    [downloadedTracks]
  );

  const downloadedAlbumIds = useMemo(
    () => getFullyDownloadedAlbumIds(
      // `nativeId`, matching what DownloadContext persists a track under
      // (`trackId`/`originalTrack.id` are `nativeId` there too — see its
      // `toQueueTrack` doc) — these two sides have to agree on which id they
      // key by, or every album would read as never fully downloaded.
      tracks.map(track => ({ id: track.nativeId, albumId: track.album.nativeId })),
      downloadedTrackIds
    ),
    [tracks, downloadedTrackIds]
  );

  const downloadedPlaylistIds = useMemo(
    () => new Set(
      getAllDownloadedCollections()
        .filter(collection => collection.type === 'playlist')
        .map(collection => String(collection.id))
    ),
    [getAllDownloadedCollections]
  );

  const downloaded: DownloadedIds = useMemo(() => ({
    tracks: downloadedTrackIds,
    albums: downloadedAlbumIds,
    playlists: downloadedPlaylistIds,
  }), [downloadedTrackIds, downloadedAlbumIds, downloadedPlaylistIds]);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [degraded, setDegraded] = useState(false);

  const searchRequestIdRef = useRef(0);

  // Pre-compute lowercased strings once when library data changes, not on every keystroke.
  // With 9000 tracks this avoids 18,000 toLowerCase() calls per search query.
  const searchIndex: SearchIndex = useMemo(() => ({
    tracks: tracks.map(t => ({ item: t, lc: `${t.title.toLowerCase()} ${t.artist.name.toLowerCase()}` })),
    albums: albums.map(a => ({ item: a, lc: a.title.toLowerCase() })),
    artists: artists.map(a => ({ item: a, lc: a.name.toLowerCase() })),
    playlists: playlists.map(p => ({ item: p, lc: p.title.toLowerCase() })),
  }), [tracks, albums, artists, playlists]);

  const clearSearch = useCallback(() => {
    searchRequestIdRef.current += 1;
    setSearchResults([]);
    setIsLoading(false);
    setHasError(false);
    setDegraded(false);
  }, []);

  const handleSearchWithFilters = useCallback(async (query: string, filters: SearchFilters) => {
    const requestId = ++searchRequestIdRef.current;
    if (!query.trim()) {
      setSearchResults([]);
      setIsLoading(false);
      setHasError(false);
      setDegraded(false);
      return;
    }
    setIsLoading(true);
    let errored = false;
    try {
      const lowerQuery = query.toLowerCase();
      const results: SearchResult[] = [];
      const entityTypes = filters.entityTypes ?? ALL_SEARCH_ENTITY_TYPES;

      // Decide the legs up front rather than at each call site. A leg that
      // cannot land is not attempted at all: each one would otherwise hang to
      // its own timeout on every keystroke and then land in the same `catch`
      // as a real failure, so local results that succeeded were shown
      // underneath an error banner. Library and external legs are mutually
      // exclusive here — `resultScope` picks one family, never both.
      const legs = planSearchLegs({
        resultScope: filters.resultScope,
        enabledExternalSourceIds: filters.sourceIds,
        searchScope,
        serverReachable: canReachServer,
        deviceOnline: canReachExternal,
      });

      if (legs.client) {
        results.push(...searchLibraryLeg(searchIndex, query, downloaded));
      }
      if (requestId !== searchRequestIdRef.current) return;

      if (legs.server) {
        try { results.push(...await searchServerLeg(api?.search, query, downloaded)); } catch { errored = true; }
      }
      if (requestId !== searchRequestIdRef.current) return;

      if (legs.externalSources.length > 0) {
        try { results.push(...await searchExternalLeg(legs.externalSources, query, entityTypes)); } catch { errored = true; }
      }
      if (requestId !== searchRequestIdRef.current) return;

      setSearchResults(dedupeAndSort(results, lowerQuery));
      setHasError(errored);
      setDegraded(legs.degraded);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  }, [api, canReachExternal, canReachServer, downloaded, searchIndex, searchScope]);

  const value = useMemo<SearchContextType>(() => ({
    searchResults,
    clearSearch,
    isLoading,
    hasError,
    degraded,
    handleSearchWithFilters,
  }), [searchResults, clearSearch, isLoading, hasError, degraded, handleSearchWithFilters]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};
