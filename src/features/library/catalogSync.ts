/**
 * One run of a catalog sync.
 *
 * Deliberately free of React and of module state: given a client, an adapter
 * and a server, it fetches every catalog resource and reports what it found.
 * The previous implementation kept a module-level `activeSyncServerId` and a
 * hand-rolled listener set to stop two runs overlapping and to tell the UI a
 * sync was happening — a second store for a fact the QueryClient already
 * holds, and one that every hook instance had to be wired into by hand.
 *
 * Nothing is copied anywhere afterwards. Each fetch writes the cache entry the
 * screens already read, so the sync *is* the screens' own fetch performed
 * early, rather than a pipeline feeding a separate store.
 */
import type { QueryClient } from '@tanstack/react-query';
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { CATALOG_RESOURCES } from './catalogQueries';

interface ServerStat {
  id: string;
  playCount: number;
  lastPlayedAt: number;
}

export interface CatalogSyncResult {
  /** Resources whose fetch rejected. A sync is not all-or-nothing. */
  failed: string[];
  /** True when the sync ended with something worth showing. */
  hasData: boolean;
  genres: string[] | undefined;
  albumStats: ServerStat[];
  songStats: ServerStat[];
}

/**
 * Play counts the origin reported, for seeding local stats.
 *
 * Only entities that actually carry a count are included, and the caller is
 * expected to skip the dispatch entirely when the list is empty: an empty list
 * is almost never "nobody has played anything", it is "this origin does not
 * report play counts", and the action that consumes it replaces a server's
 * whole stats namespace.
 */
const statsFrom = (entities: readonly (Album | Song)[] | undefined): ServerStat[] =>
  (entities ?? [])
    .filter(entity => entity.serverPlayCount !== undefined)
    .map(entity => ({
      id: entity.nativeId,
      playCount: entity.serverPlayCount as number,
      lastPlayedAt: entity.serverLastPlayedAt ?? 0,
    }));

export async function runCatalogSync({
  queryClient,
  api,
  serverId,
  force,
}: {
  queryClient: QueryClient;
  api: ApiAdapter;
  serverId: string;
  force: boolean;
}): Promise<CatalogSyncResult> {
  const settled = await Promise.allSettled(
    CATALOG_RESOURCES.map(resource =>
      queryClient.fetchQuery({
        queryKey: resource.queryKey(serverId),
        queryFn: () => resource.fetch(api),
        staleTime: force ? 0 : resource.staleTime,
      })
    )
  );

  // A resource that failed may still have a usable cached copy from an
  // earlier run; read through to it rather than treating the whole sync as
  // lost because one endpoint was down.
  const read = <T>(index: number): T | undefined => {
    const outcome = settled[index];
    return outcome.status === 'fulfilled'
      ? (outcome.value as T)
      : queryClient.getQueryData<T>(CATALOG_RESOURCES[index].queryKey(serverId));
  };

  const byName = <T>(name: (typeof CATALOG_RESOURCES)[number]['name']): T | undefined =>
    read<T>(CATALOG_RESOURCES.findIndex(resource => resource.name === name));

  const albums = byName<Album[]>('albums');
  const artists = byName<unknown[]>('artists');
  const playlists = byName<unknown[]>('playlists');
  const tracks = byName<Song[]>('tracks');
  const starred = byName<{ songs?: Song[] }>('starred');
  const genres = byName<string[]>('genres');

  return {
    failed: CATALOG_RESOURCES
      .filter((_, index) => settled[index].status === 'rejected')
      .map(resource => resource.name),
    hasData: Boolean(
      albums?.length ||
      artists?.length ||
      playlists?.length ||
      tracks?.length ||
      genres?.length ||
      starred?.songs?.length
    ),
    genres,
    albumStats: statsFrom(albums),
    songStats: statsFrom(tracks),
  };
}
