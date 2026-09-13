import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';

type UsePlaylistResult = {
  playlist: Playlist | null;
  /** The playlist's tracks, in playlist order — see `PlaylistDetail`. */
  songs: Song[];
  isLoading: boolean;
  songsLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked.
   * Unlike the album fallback, playlist membership was never synced list-wide
   * (only a playlist's own metadata was), so a degraded playlist that was
   * never opened online shows no songs — the flag lets the screen say why.
   * A previously-opened playlist has its own `[Playlist, serverId, id]`
   * persisted cache entry with its songs already in it and isn't degraded. */
  degraded: boolean;
};

/**
 * `PlaylistsApi.get` returns the playlist and its tracks as a pair rather
 * than a playlist with an embedded `songs` array — see `PlaylistDetail`.
 * This playlist may never have been individually fetched, so the offline
 * fallback reads the playlists *list*'s persisted cache entry directly
 * (`[Playlists, serverId]`) and looks it up by `nativeId`; its songs stay
 * empty, same as before the rewrite — a playlist's track membership was
 * never synced into the list-level cache entry, only the playlist's own
 * metadata.
 */
export function usePlaylist(id: string): UsePlaylistResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;

  const query = useOfflineFirstQuery<PlaylistDetail | null>({
    queryKey: [QueryKeys.Playlist, serverId, id],
    queryFn: async () => api.playlists.get(id),
    enabled: !!serverId && !!id,
    staleTime: staleTime.playlists,
    emptyValue: null,
    hasData: hasValue,
    fallback: {
      sources: [{ queryKey: [QueryKeys.Playlists, serverId], queryFn: api.playlists.list }],
      select: ([cachedPlaylists]) => {
        const playlists = Array.isArray(cachedPlaylists) ? (cachedPlaylists as Playlist[]) : [];
        const playlist = playlists.find(p => p.nativeId === id);
        if (!playlist) return undefined;
        return { playlist, songs: [] };
      },
    },
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
