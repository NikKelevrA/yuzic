import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';
import { buildFallbackAlbumSongs } from './fallbackSongs';

type UseAlbumResult = {
  album: Album | null;
  /** The album's tracks, in running order — see `AlbumDetail`. */
  songs: Song[];
  isLoading: boolean;
  songsLoading: boolean;
  error: Error | null;
  /** True when showing library-synced data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `AlbumsApi.get` returns the album and its tracks as a pair rather than an
 * album with an embedded `songs` array — see `AlbumDetail`. The offline
 * fallback reconstructs the same shape from `LibraryContext`, now that it
 * holds domain entities too: the album is looked up by `nativeId` in the
 * synced album list, and its tracks are rebuilt from the synced track list
 * via `buildFallbackAlbumSongs` (matching on `song.album.nativeId`, see that
 * function's comment for why `nativeId` rather than `localId` is safe here).
 */
export function useAlbum(id: string): UseAlbumResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { albums: libraryAlbums, tracks: libraryTracks } = useLibrary();

  const fallbackData = useMemo<AlbumDetail | null>(() => {
    const album = libraryAlbums.find(a => a.nativeId === id) ?? null;
    if (!album) return null;
    return { album, songs: buildFallbackAlbumSongs(libraryTracks, id) };
  }, [libraryAlbums, libraryTracks, id]);

  const query = useOfflineFirstQuery<AlbumDetail | null>({
    queryKey: [QueryKeys.Album, activeServer?.id, id],
    queryFn: async () => api.albums.get(id),
    enabled: !!activeServer?.id && !!id,
    staleTime: staleTime.albums,
    fallbackData,
    hasFallbackData: hasValue,
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
