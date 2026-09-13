import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';

type UseStarredSongsResult = {
  songs: Song[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

const EMPTY: { songs: Song[]; albums: Album[] } = { songs: [], albums: [] };

// Shares a single query (and cache entry) with useStarredAlbums — the
// underlying API call already returns both songs and albums together, so
// both hooks must use the identical queryKey/queryFn to avoid two hooks
// racing to populate the same cache slot with differently-shaped data.
//
// See `useAlbums` for why the persisted query cache is the whole offline
// story now.
export function useStarredSongs(): UseStarredSongsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const query = useOfflineFirstQuery<{ songs: Song[]; albums: Album[] }>({
    queryKey: [QueryKeys.Starred, activeServer?.id],
    queryFn: api.starred.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.starred,
    emptyValue: EMPTY,
    hasData: value => hasArrayData(value.songs) || hasArrayData(value.albums),
  });

  return {
    songs: query.data.songs,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
