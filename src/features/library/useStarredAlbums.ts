import { useSelector } from 'react-redux';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';
import { useCatalogHydrated } from '@/features/library/useCatalogHydration';

type UseStarredAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

const EMPTY: { songs: Song[]; albums: Album[] } = { songs: [], albums: [] };

// Shares a single query (and cache entry) with useStarredSongs — see the
// comment there for why the queryKey/queryFn must stay identical.
//
// See `useAlbums` for why the persisted query cache is the whole offline
// story now.
export function useStarredAlbums(): UseStarredAlbumsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const hydrated = useCatalogHydrated(activeServer?.id);

  const query = useOfflineFirstQuery<{ songs: Song[]; albums: Album[] }>({
    queryKey: [QueryKeys.Starred, activeServer?.id],
    queryFn: api.starred.list,
    // Not until the stored catalog has had its chance. A cold start otherwise
    // downloads the whole library again while hydration is reading it off
    // disk, and holds both — see `useCatalogHydrated`.
    enabled: !!activeServer?.id && hydrated,
    staleTime: staleTime.starred,
    emptyValue: EMPTY,
    hasData: value => hasArrayData(value.songs) || hasArrayData(value.albums),
  });

  return {
    albums: query.data.albums,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
