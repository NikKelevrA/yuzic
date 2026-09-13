import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { buildFallbackAlbumSongs } from './fallbackSongs';

type UseAlbumResult = {
  album: Album | null;
  /** The album's tracks, in running order — see `AlbumDetail`. */
  songs: Song[];
  isLoading: boolean;
  songsLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `AlbumsApi.get` returns the album and its tracks as a pair rather than an
 * album with an embedded `songs` array — see `AlbumDetail`. This album may
 * never have been individually fetched (and so has no entry of its own in
 * the persisted query cache at `[Album, serverId, id]`), so the offline
 * fallback reads two *other* persisted cache entries directly — the albums
 * list (`[Albums, serverId]`, to find this album by `nativeId`) and the
 * tracks list (`[Tracks, serverId]`, to rebuild its songs via
 * `buildFallbackAlbumSongs`) — rather than a second store.
 */
export function useAlbum(id: string): UseAlbumResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;

  const query = useOfflineFirstQuery<AlbumDetail | null>({
    queryKey: [QueryKeys.Album, serverId, id],
    queryFn: async () => api.albums.get(id),
    enabled: !!serverId && !!id,
    staleTime: staleTime.albums,
    emptyValue: null,
    hasData: hasValue,
    fallback: {
      sources: [
        { queryKey: [QueryKeys.Albums, serverId], queryFn: api.albums.list },
        { queryKey: [QueryKeys.Tracks, serverId], queryFn: api.tracks.list },
      ],
      select: ([cachedAlbums, cachedTracks]) => {
        const albums = Array.isArray(cachedAlbums) ? (cachedAlbums as Album[]) : [];
        const tracks = Array.isArray(cachedTracks) ? (cachedTracks as Song[]) : [];
        const album = albums.find(a => a.nativeId === id);
        if (!album) return undefined;
        return { album, songs: buildFallbackAlbumSongs(tracks, id) };
      },
    },
  });

  return {
    album: query.data?.album ?? null,
    songs: query.data?.songs ?? [],
    isLoading: query.isLoading,
    songsLoading: query.query.isFetching && (query.data?.songs?.length ?? 0) === 0,
    error: query.error,
    degraded: query.degraded,
  };
}
