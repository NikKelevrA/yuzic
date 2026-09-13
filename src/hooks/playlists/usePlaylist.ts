import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UsePlaylistResult = {
  playlist: Playlist | null;
  /** The playlist's tracks, in playlist order — see `PlaylistDetail`. */
  songs: Song[];
  isLoading: boolean;
  songsLoading: boolean;
  error: Error | null;
  /** True when showing library-synced data because the server couldn't be asked.
   * Unlike the album fallback, playlist membership isn't synced to Redux, so a
   * degraded playlist that was never opened online shows no songs — the flag
   * lets the screen say why. Previously-opened playlists restore their songs
   * from the persisted query cache and aren't degraded. */
  degraded: boolean;
};

/**
 * `PlaylistsApi.get` returns the playlist and its tracks as a pair rather
 * than a playlist with an embedded `songs` array — see `PlaylistDetail`. The
 * fallback looks the playlist up by `nativeId` in the synced (domain)
 * playlist list; its songs stay empty, same as before the rewrite — a
 * playlist's track membership was never synced into Redux, only the
 * playlist's own metadata.
 */
export function usePlaylist(id: string): UsePlaylistResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { playlists: libraryPlaylists } = useLibrary();

  const fallbackData = useMemo<PlaylistDetail | null>(() => {
    const playlist = libraryPlaylists.find(p => p.nativeId === id) ?? null;
    if (!playlist) return null;
    return { playlist, songs: [] };
  }, [libraryPlaylists, id]);

  const query = useOfflineFirstQuery<PlaylistDetail | null>({
    queryKey: [QueryKeys.Playlist, activeServer?.id, id],
    queryFn: async () => api.playlists.get(id),
    enabled: !!activeServer?.id && !!id,
    staleTime: staleTime.playlists,
    fallbackData,
    hasFallbackData: hasValue,
  });

  return {
    playlist: query.data?.playlist ?? null,
    songs: query.data?.songs ?? [],
    isLoading: query.isLoading,
    songsLoading: query.query.isFetching && (query.data?.songs?.length ?? 0) === 0,
    error: query.error,
    degraded: query.degraded,
  };
}
