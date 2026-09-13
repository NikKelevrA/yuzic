import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';

type UseAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * The persisted TanStack Query cache (`PersistQueryClientProvider` in
 * `_layout.tsx`) is the only place the catalog lives now — there is no
 * separate Redux/LibraryContext mirror. Offline, `enabled` below goes
 * false and no fetch happens, but `useQuery` still returns whatever this
 * exact key's cache entry was hydrated with on cold start (or last held from
 * a previous session), so `query.data` doubles as the offline fallback with
 * no extra plumbing.
 */
export function useAlbums(): UseAlbumsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const query = useOfflineFirstQuery<Album[]>({
    queryKey: [QueryKeys.Albums, activeServer?.id],
    queryFn: api.albums.list,
    enabled: !!activeServer?.id,
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
