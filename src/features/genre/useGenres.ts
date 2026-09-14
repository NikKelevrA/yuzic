import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useApi } from '@/providers/registry/useApi';
import { useAlbums } from '@/features/album/useAlbums';
import { libraryGenres } from '@/features/genre/genreList';
import { QueryKeys } from '@/state/query/queryKeys';
import { staleTime } from '@/state/query/staleTime';
import { hasArrayData, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';

/**
 * The genres in the active server's library.
 *
 * Read from the same cache entry the catalog sync fills (`[Genres, serverId]`),
 * like every other catalog list, and fetched on its own when nothing has filled
 * it yet. Genres used to live only in a Redux map the sync wrote — so a server
 * whose sync had not run (a newly added one, or any server while the one global
 * sync throttle was still counting down) showed "0 genres" however well tagged
 * its albums were.
 *
 * The server's own list wins when it has one; otherwise the albums' tags are
 * the list, since that is exactly what the genre screens count against.
 */
export function useGenres(): { genres: string[]; isLoading: boolean } {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { albums } = useAlbums();

  const query = useOfflineFirstQuery<string[]>({
    queryKey: [QueryKeys.Genres, activeServer?.id],
    queryFn: () => api.genres.list(),
    enabled: !!activeServer?.id,
    staleTime: staleTime.genres,
    emptyValue: [],
    hasData: hasArrayData,
  });

  const genres = useMemo(() => libraryGenres(query.data, albums), [query.data, albums]);
  return { genres, isLoading: query.isLoading };
}
