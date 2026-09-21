import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';
import { inRunningOrder } from './fallbackSongs';
import { songsByAlbumNativeId } from '@/features/library/catalogStore';
import { useCatalogStore } from '@/features/library/useCatalogStore';

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
 * the persisted query cache at `[Album, serverId, id]`), so when the server
 * cannot be asked the album and its tracks come out of the catalog store,
 * which holds both indexed. That used to reach into two *other* cache
 * entries — the albums list and the tracks list — through this hook's own
 * fallback mechanism, scanning each. The store is the one way in now.
 */
export function useAlbum(id: string): UseAlbumResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;
  const store = useCatalogStore();

  // The album and its tracks, for one opened while the server cannot be
  // asked. Both are index lookups now; this was two scans of the library.
  const fallbackValue = useMemo(() => {
    const album = store.albumByNativeId.get(id);
    if (!album) return undefined;
    return { album, songs: inRunningOrder(songsByAlbumNativeId(store, id)) };
  }, [store, id]);

  const query = useOfflineFirstQuery<AlbumDetail | null>({
    queryKey: [QueryKeys.Album, serverId, id],
    queryFn: async () => api.albums.get(id),
    enabled: !!serverId && !!id,
    staleTime: staleTime.albums,
    emptyValue: null,
    hasData: hasValue,
    fallbackValue,
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
