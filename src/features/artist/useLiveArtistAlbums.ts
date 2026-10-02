import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import type { Album } from '@/domain/entities/Album';
import { QueryKeys } from '@/state/query/queryKeys';
import { useApi } from '@/providers/registry/useApi';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';

type UseLiveArtistAlbumsResult = {
  albums: Album[];
  isLoading: boolean;
};

const NO_ALBUMS: Album[] = [];

/**
 * Live fallback for `useArtistAlbums` — only meant to be enabled when the
 * synced catalog has nothing for this artist id (virtual-catalog browsing;
 * see `useArtistScreenModel`). Unlike `useArtist`/`useAlbum`, this is not
 * offline-first: there is nothing in the catalog store to fall back to for
 * an id the sync has never indexed, so a failure here is just a failure.
 */
export function useLiveArtistAlbums(artistId: string, enabled: boolean): UseLiveArtistAlbumsResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;
  const getAlbums = api.artists.getAlbums;

  const query = useQuery({
    queryKey: [QueryKeys.ArtistAlbums, serverId, artistId],
    queryFn: () => getAlbums!(artistId),
    enabled: enabled && !!serverId && !!artistId && !!getAlbums,
    staleTime: 1000 * 60 * 5,
  });

  return {
    albums: query.data ?? NO_ALBUMS,
    isLoading: query.isLoading,
  };
}
