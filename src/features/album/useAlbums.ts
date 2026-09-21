import { useSelector } from 'react-redux';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Album } from '@/domain/entities/Album';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';
import { useCatalogHydrated } from '@/features/library/useCatalogHydration';

type UseAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * The TanStack Query cache is the only place the catalog lives at runtime —
 * there is no separate Redux/LibraryContext mirror. Offline, `enabled` below
 * goes false and no fetch happens, but `useQuery` still returns whatever this
 * exact key's cache entry was hydrated with on cold start (or last held from
 * a previous session), so `query.data` doubles as the offline fallback with
 * no extra plumbing.
 *
 * What fills that entry on a cold start is `features/library/
 * useCatalogHydration`, not the query persister: the catalog is stored per
 * resource in its own namespace rather than inside the persister's blob,
 * because the blob is rewritten whenever anything in the cache changes and a
 * large library made every one of those writes cost the whole library. See
 * `catalogPersistence` for the numbers. Nothing about this hook changes for
 * it, except that the entry may arrive a moment after first paint instead of
 * before it.
 */
export function useAlbums(): UseAlbumsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const hydrated = useCatalogHydrated(activeServer?.id);

  const query = useOfflineFirstQuery<Album[]>({
    queryKey: [QueryKeys.Albums, activeServer?.id],
    queryFn: api.albums.list,
    // Not until the stored catalog has had its chance. A cold start otherwise
    // downloads the whole library again while hydration is reading it off
    // disk, and holds both — see `useCatalogHydrated`.
    enabled: !!activeServer?.id && hydrated,
    staleTime: staleTime.albums,
    emptyValue: [],
    hasData: hasArrayData,
  });

  return {
    albums: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
