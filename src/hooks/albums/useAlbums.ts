import { useSelector } from 'react-redux';
import { QueryKeys } from '@/enums/queryKeys';
import type { Album } from '@/domain/entities/Album';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { hasArrayData, useOfflineFirstQuery } from '@/hooks/useOfflineFirstQuery';
import { useLibrary } from '@/contexts/LibraryContext';

type UseAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
  error: Error | null;
  /** True when showing library-synced data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `AlbumsApi.list` returns domain `Album[]`, and `LibraryContext.albums` is
 * now the same domain shape (see `LibraryContext.tsx`), so the synced
 * library can be handed straight to `useOfflineFirstQuery` as a same-typed
 * fallback — no conversion needed.
 */
export function useAlbums(): UseAlbumsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const { albums: libraryAlbums } = useLibrary();

  const query = useOfflineFirstQuery<Album[]>({
    queryKey: [QueryKeys.Albums, activeServer?.id],
    queryFn: api.albums.list,
    enabled: !!activeServer?.id,
    staleTime: staleTime.albums,
    fallbackData: libraryAlbums,
    hasFallbackData: hasArrayData,
  });

  return {
    albums: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
