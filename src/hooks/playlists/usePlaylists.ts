import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Playlist } from '@/domain/entities/Playlist';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';

type UsePlaylistsResult = {
  playlists: Playlist[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/** See `useAlbums` for why the persisted query cache is the whole offline story now. */
export function usePlaylists(): UsePlaylistsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const query = useOfflineFirstQuery<Playlist[]>({
    queryKey: [QueryKeys.Playlists, activeServer?.id],
    queryFn: api.playlists.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.playlists,
    emptyValue: [],
    hasData: hasArrayData,
  });

  return {
    playlists: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
