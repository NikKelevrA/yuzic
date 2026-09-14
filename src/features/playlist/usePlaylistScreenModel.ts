/**
 * Route params -> one canonical playlist -> one `PlaylistScreenModel`.
 *
 * Mirrors `useArtistScreenModel`/`useAlbumScreenModel`: identity resolution
 * (`playlistRepository.getPlaylist`, which relates the fetched playlist to
 * whatever is already loaded in the library — same reasoning as
 * `songRepository.getSong`) and the offline-first fallback both happen here,
 * once, instead of the screen re-deriving them. `origin` is the answer to
 * "where did this playlist come from" — see `playlistOrigin.ts` — computed
 * from the entity's own `provenance`/`isOwned` rather than inferred from its
 * title.
 */
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { useApi } from '@/api';
import { QueryKeys } from '@/enums/queryKeys';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { usePlaylists } from '@/hooks/playlists/usePlaylists';
import { getPlaylist } from './playlistRepository';
import { resolvePlaylistOrigin, type PlaylistOrigin } from './playlistOrigin';

export type PlaylistRouteParams = {
  id: string;
};

export type PlaylistScreenModel = {
  status: 'loading' | 'not-found' | 'error' | 'ready';
  playlist: Playlist | null;
  /** The playlist's tracks, in playlist order — see `PlaylistDetail`. */
  songs: Song[];
  songsLoading: boolean;
  /** A playlist's membership was never synced list-wide, only its metadata,
   *  so a degraded playlist that was never opened online shows no songs. */
  degraded: boolean;
  /** Where this playlist came from — `null` until the playlist itself is
   *  known. */
  origin: PlaylistOrigin | null;
};

export function usePlaylistScreenModel(params: PlaylistRouteParams): PlaylistScreenModel {
  const { id } = params;
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;
  const { playlists: libraryPlaylists } = usePlaylists();

  const query = useOfflineFirstQuery<PlaylistDetail | null>({
    queryKey: [QueryKeys.Playlist, serverId, id],
    queryFn: () => getPlaylist({ kind: 'server', nativeId: id }, { api: api.playlists, libraryPlaylists }),
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

  const playlist = query.data?.playlist ?? null;
  const songs = query.data?.songs ?? [];

  const origin = useMemo(() => (playlist ? resolvePlaylistOrigin(playlist) : null), [playlist]);

  const status: PlaylistScreenModel['status'] = (() => {
    if (query.isLoading) return 'loading';
    if (!playlist) return query.error ? 'error' : 'not-found';
    return 'ready';
  })();

  return {
    status,
    playlist,
    songs,
    songsLoading: query.query.isFetching && songs.length === 0,
    degraded: query.degraded,
    origin,
  };
}
