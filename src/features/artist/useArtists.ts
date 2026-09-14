import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Artist } from '@/domain/entities/Artist';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';

type UseArtistsResult = {
  artists: Artist[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/** See `useAlbums` for why the persisted query cache is the whole offline story now. */
export function useArtists(): UseArtistsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const query = useOfflineFirstQuery<Artist[]>({
    queryKey: [QueryKeys.Artists, activeServer?.id],
    queryFn: api.artists.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.artists,
    emptyValue: [],
    hasData: hasArrayData,
  });

  return {
    artists: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
