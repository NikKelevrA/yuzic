import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Artist } from '@/domain/entities/Artist';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UseArtistResult = {
  artist: Artist | null;
  isLoading: boolean;
  error: Error | null;
  /** True when showing library-synced data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `ArtistsApi.get` returns the domain `Artist`, and `LibraryContext.artists`
 * is now the same domain shape, so the offline fallback is a plain lookup by
 * `nativeId` in the synced artist list — no conversion needed.
 */
export function useArtist(id: string): UseArtistResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { artists: libraryArtists } = useLibrary();

  const fallbackData = useMemo(
    () => libraryArtists.find(a => a.nativeId === id) ?? null,
    [libraryArtists, id]
  );

  const query = useOfflineFirstQuery<Artist | null>({
    queryKey: [QueryKeys.Artist, activeServer?.id, id],
    queryFn: async () => api.artists.get(id),
    enabled: !!activeServer?.id && !!id,
    staleTime: staleTime.artists,
    fallbackData,
    hasFallbackData: hasValue,
  });

  return {
    artist: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
