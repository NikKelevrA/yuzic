import { useSelector } from 'react-redux';
import { QueryKeys } from '@/state/query/queryKeys';
import type { Artist } from '@/domain/entities/Artist';
import { useApi } from '@/providers/registry/useApi';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { hasValue, useOfflineFirstQuery } from '@/state/query/useOfflineFirstQuery';

type UseArtistResult = {
  artist: Artist | null;
  isLoading: boolean;
  error: Error | null;
  /** True when showing persisted-cache data because the server couldn't be asked. */
  degraded: boolean;
};

/**
 * `ArtistsApi.get` returns the domain `Artist`. This artist may never have
 * been individually fetched, so the offline fallback reads the artists
 * *list*'s persisted cache entry directly (`[Artists, serverId]`) and looks
 * it up by `nativeId` — see `useAlbum` for why this is a direct cache read
 * rather than a second store.
 */
export function useArtist(id: string): UseArtistResult {
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;

  const query = useOfflineFirstQuery<Artist | null>({
    queryKey: [QueryKeys.Artist, serverId, id],
    queryFn: async () => api.artists.get(id),
    enabled: !!serverId && !!id,
    staleTime: staleTime.artists,
    emptyValue: null,
    hasData: hasValue,
    fallback: {
      sources: [{ queryKey: [QueryKeys.Artists, serverId], queryFn: api.artists.list }],
      select: ([cachedArtists]) => {
        const artists = Array.isArray(cachedArtists) ? (cachedArtists as Artist[]) : [];
        return artists.find(a => a.nativeId === id);
      },
    },
  });

  return {
    artist: query.data,
    isLoading: query.isLoading,
    error: query.error,
    degraded: query.degraded,
  };
}
