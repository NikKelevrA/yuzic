import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Artist } from '@/domain/entities/Artist';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UseArtistsResult = {
  artists: Artist[];
  isLoading: boolean;
  error: Error | null;
};

/**
 * `ArtistsApi.list` returns domain `Artist[]`. See `useArtist` for why the
 * synced-library fallback needs no conversion now.
 */
export function useArtists(): UseArtistsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { artists: libraryArtists } = useLibrary();

  const query = useOfflineFirstQuery<Artist[]>({
    queryKey: [QueryKeys.Artists, activeServer?.id],
    queryFn: api.artists.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.artists,
    fallbackData: libraryArtists,
    hasFallbackData: hasArrayData,
  });

  return {
    artists: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
