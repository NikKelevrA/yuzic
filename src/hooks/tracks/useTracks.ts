import { useSelector } from "react-redux";
import { QueryKeys } from "@/enums/queryKeys";
import type { Song } from "@/domain/entities/Song";
import { useApi } from "@/api";
import { staleTime } from "@/constants/staleTime";
import { selectActiveServer } from "@/utils/redux/selectors/serversSelectors";
import { hasArrayData, useOfflineFirstQuery } from "@/hooks/useOfflineFirstQuery";

type UseTracksResult = {
  tracks: Song[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/** See `useAlbums` for why the persisted query cache is the whole offline story now. */
export function useTracks(): UseTracksResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const query = useOfflineFirstQuery<Song[]>({
    queryKey: [QueryKeys.Tracks, activeServer?.id],
    queryFn: api.tracks.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.tracks,
    emptyValue: [],
    hasData: hasArrayData,
  });

  return {
    tracks: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
