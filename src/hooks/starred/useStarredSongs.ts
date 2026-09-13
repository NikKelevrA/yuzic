import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UseStarredSongsResult = {
  songs: Song[];
  isLoading: boolean;
  error: Error | null;
};

// Shares a single query (and cache entry) with useStarredAlbums — the
// underlying API call already returns both songs and albums together, so
// both hooks must use the identical queryKey/queryFn to avoid two hooks
// racing to populate the same cache slot with differently-shaped data.
//
// See `useStarredAlbums` for why the synced-library fallback needs no
// conversion now.
export function useStarredSongs(): UseStarredSongsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { starred: librarySongs, starredAlbums: libraryAlbums } = useLibrary();

  const fallbackData = useMemo(
    () => ({ songs: librarySongs, albums: libraryAlbums }),
    [librarySongs, libraryAlbums]
  );

  const query = useOfflineFirstQuery<{ songs: Song[]; albums: Album[] }>({
    queryKey: [QueryKeys.Starred, activeServer?.id],
    queryFn: api.starred.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.starred,
    fallbackData,
    hasFallbackData: value => hasArrayData(value.songs) || hasArrayData(value.albums),
  });

  return {
    songs: query.data.songs,
    isLoading: query.isLoading,
    error: query.error,
  };
}
