import { useSelector } from 'react-redux';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Artist } from '@/domain/entities/Artist';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';
import { useCatalogStore } from '@/features/library/useCatalogStore';

type UseArtistResult = {
  artist: Artist | null;
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `ArtistsApi.get` returns the domain `Artist`. This artist may never have
 * been individually fetched, so when the server cannot be asked the answer
 * comes out of the catalog store, which already holds every artist indexed by
 * `nativeId`. That used to be a scan of the artists list's cache entry,
 * reached through this hook's own fallback mechanism — a second way into the
 * catalog, which is the thing the store exists to remove.
 */
export function useArtist(id: string): UseArtistResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;
  const store = useCatalogStore();

  const query = useOfflineFirstQuery<Artist | null>({
    queryKey: [QueryKeys.Artist, serverId, id],
    queryFn: async () => api.artists.get(id),
    enabled: !!serverId && !!id,
    staleTime: staleTime.artists,
    emptyValue: null,
    hasData: hasValue,
    fallbackValue: store.artistByNativeId.get(id),
  });

  return {
    artist: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
