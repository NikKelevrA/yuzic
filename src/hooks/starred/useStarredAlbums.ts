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

type UseStarredAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: Error | null;
};

// Shares a single query (and cache entry) with useStarredSongs — see the
// comment there for why the queryKey/queryFn must stay identical.
//
// `StarredApi.list` returns domain `Album`/`Song`, and `LibraryContext`'s
// `starred`/`starredAlbums` are now the same domain shapes, so the fallback
// needs no conversion.
export function useStarredAlbums(): UseStarredAlbumsResult {
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
    albums: query.data.albums,
    isLoading: query.isLoading,
    error: query.error,
  };
}
