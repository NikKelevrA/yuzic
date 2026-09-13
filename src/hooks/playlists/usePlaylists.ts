import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Playlist } from '@/domain/entities/Playlist';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UsePlaylistsResult = {
  playlists: Playlist[];
  isLoading: boolean;
  error: Error | null;
};

/**
 * `PlaylistsApi.list` returns domain `Playlist[]`. See `usePlaylist` for why
 * the synced-library fallback needs no conversion now.
 */
export function usePlaylists(): UsePlaylistsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { playlists: libraryPlaylists } = useLibrary();

  const query = useOfflineFirstQuery<Playlist[]>({
    queryKey: [QueryKeys.Playlists, activeServer?.id],
    queryFn: api.playlists.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.playlists,
    fallbackData: libraryPlaylists,
    hasFallbackData: hasArrayData,
  });

  return {
    playlists: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
