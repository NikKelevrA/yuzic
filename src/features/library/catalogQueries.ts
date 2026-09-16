/**
 * The catalog resources a sync refreshes, described once.
 *
 * Each entry names the cache key a resource lives under and how to fetch it.
 * The screens' hooks read those same keys, which is what makes a sync and a
 * screen read the one store rather than two: a sync is not a separate
 * pipeline that copies data somewhere, it is the same fetch the screen would
 * have done, performed early.
 *
 * Deliberately no `staleTime` here. The screens' hooks carry one — `Infinity`,
 * so a mounted screen renders the persisted copy instead of a spinner — and a
 * resource that shared it with the sync could never be refreshed by one. See
 * `runCatalogSync`.
 */
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import { QueryKeys } from '@/state/query/queryKeys';
import type { QueryKey } from '@tanstack/react-query';

interface CatalogResource {
  /** Stable name, used for reporting which part of a sync failed. */
  name: 'albums' | 'artists' | 'playlists' | 'tracks' | 'starred' | 'genres';
  queryKey: (serverId: string) => QueryKey;
  fetch: (api: ApiAdapter) => Promise<unknown>;
}

export const CATALOG_RESOURCES: readonly CatalogResource[] = [
  {
    name: 'albums',
    queryKey: serverId => [QueryKeys.Albums, serverId],
    fetch: api => api.albums.list(),
  },
  {
    name: 'artists',
    queryKey: serverId => [QueryKeys.Artists, serverId],
    fetch: api => api.artists.list(),
  },
  {
    name: 'playlists',
    queryKey: serverId => [QueryKeys.Playlists, serverId],
    fetch: api => api.playlists.list(),
  },
  {
    name: 'tracks',
    queryKey: serverId => [QueryKeys.Tracks, serverId],
    fetch: api => api.tracks.list(),
  },
  {
    name: 'starred',
    queryKey: serverId => [QueryKeys.Starred, serverId],
    fetch: api => api.starred.list(),
  },
  {
    name: 'genres',
    queryKey: serverId => [QueryKeys.Genres, serverId],
    fetch: api => api.genres.list(),
  },
];

/**
 * The mutation key a catalog sync runs under, scoped per server.
 *
 * Scoped because two configured servers sync independently, and a run against
 * one must neither block nor be reported as a run against the other. The
 * QueryClient owns this: `isMutating` against this key is what tells a second
 * caller a sync is already in flight, replacing a module-level flag that every
 * hook instance had to be told about by hand.
 */
export const catalogSyncKey = (serverId: string) => ['catalog-sync', serverId];
