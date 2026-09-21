import { useSelector } from "react-redux";
import { QueryKeys } from "@/state/query/queryKeys";
import type { Song } from "@/domain/entities/Song";
import { useApi } from "@/providers/registry/useApi";
import { staleTime } from "@/state/query/staleTime";
import { selectActiveServer } from "@/state/redux/selectors/serversSelectors";
import { hasArrayData, useOfflineFirstQuery } from "@/state/query/useOfflineFirstQuery";
import { useCatalogHydrated } from "@/features/library/useCatalogHydration";

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
  const hydrated = useCatalogHydrated(activeServer?.id);

  const query = useOfflineFirstQuery<Song[]>({
    queryKey: [QueryKeys.Tracks, activeServer?.id],
    queryFn: api.tracks.list,
    // Not until the stored catalog has had its chance. A cold start otherwise
    // downloads the whole library again while hydration is reading it off
    // disk, and holds both — see `useCatalogHydrated`.
    enabled: !!activeServer?.id && hydrated,
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
