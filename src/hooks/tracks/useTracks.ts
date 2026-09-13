import { useSelector } from "react-redux";
import { QueryKeys } from "@/enums/queryKeys";
import type { Song } from "@/domain/entities/Song";
import { useApi } from "@/api";
import { staleTime } from "@/constants/staleTime";
import { selectActiveServer } from "@/utils/redux/selectors/serversSelectors";
import { hasArrayData, useOfflineFirstQuery } from "@/hooks/useOfflineFirstQuery";
import { useLibrary } from "@/contexts/LibraryContext";

type UseTracksResult = {
  tracks: Song[];
  isLoading: boolean;
  error: Error | null;
};

/**
 * `TracksApi.list` returns domain `Song[]`, and `LibraryContext.tracks` is
 * now the same domain shape, so the synced library is a same-typed fallback
 * with no conversion needed.
 */
export function useTracks(): UseTracksResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { tracks: libraryTracks } = useLibrary();

  const query = useOfflineFirstQuery<Song[]>({
    queryKey: [QueryKeys.Tracks, activeServer?.id],
    queryFn: api.tracks.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.tracks,
    fallbackData: libraryTracks,
    hasFallbackData: hasArrayData,
  });

  return {
    tracks: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
