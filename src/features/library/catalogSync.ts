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
import { writeCatalogResource } from './catalogPersistence';

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

/**
 * Smallest first, tracks last.
 *
 * `CATALOG_RESOURCES` is ordered for reading as a table; this is ordered for
 * the one property that matters while a sync is running, which is how much of
 * the library is in memory at once. Tracks is far the largest, so it goes when
 * nothing else is in flight — and the four small resources land, and paint,
 * before the whale starts. Same reasoning as `useCatalogHydration`, for the
 * same resource, in the other direction.
 */
const SYNC_ORDER = [...CATALOG_RESOURCES].sort(
  (left, right) => Number(left.name === 'tracks') - Number(right.name === 'tracks')
);

export async function runCatalogSync({
  queryClient,
  api,
  serverId,
}: {
  queryClient: QueryClient;
  api: ApiAdapter;
  serverId: string;
}): Promise<CatalogSyncResult> {
  const fetched = new Map<string, unknown>();

  // One at a time, each stored as it lands.
  //
  // This was `Promise.allSettled` over all six, which meant every resource's
  // response, every raw DTO and every mapped entity was alive together until
  // the slowest finished, and only then was any of it written or released. At
  // 45,000 tracks that peak is most of the heap and at 90,000 it is the crash:
  // Hermes aborts inside its own allocator, so nothing reaches the console.
  // Sequential costs the sum of the fetches rather than the longest, but four
  // of the six are small enough not to notice and the fifth is the one that
  // was killing the app.
  //
  // Only what actually arrived is stored. A rejected fetch has nothing to
  // write, and writing anyway — an empty list, or whatever the cache still
  // held — is how one flaky endpoint would empty a user's offline library. The
  // stored copy simply stays as it was until a run succeeds.
  for (const resource of SYNC_ORDER) {
    try {
      const value = await queryClient.fetchQuery({
        queryKey: resource.queryKey(serverId),
        queryFn: () => resource.fetch(api),
        // A sync always asks the server. `fetchQuery` resolves straight from
        // cache when the entry is not stale, and the catalog's entries carry
        // `staleTime: Infinity` for the screens that read them — so passing
        // that value through here, as this once did, meant a populated cache
        // entry could never be refreshed by a sync at all. The persisted cache
        // survives restarts, so after the first successful sync every app
        // start, foreground and server switch resolved from disk without a
        // request, and music added to the server stayed invisible until
        // someone pressed the manual refresh in Settings.
        //
        // Rate limiting belongs to the caller, not here: `useSync` throttles
        // at 30 minutes and drops a run while another is in flight.
        staleTime: 0,
      });
      fetched.set(resource.name, value);
      writeCatalogResource(serverId, resource.name, value);
    } catch {
      // Recorded by its absence from `fetched`; one endpoint being down is not
      // the whole sync failing.
    }
  }

  // A resource that failed may still have a usable cached copy from an
  // earlier run; read through to it rather than treating the whole sync as
  // lost because one endpoint was down.
  const byName = <T>(name: (typeof CATALOG_RESOURCES)[number]['name']): T | undefined => {
    if (fetched.has(name)) return fetched.get(name) as T;
    const resource = CATALOG_RESOURCES.find(entry => entry.name === name);
    return resource ? queryClient.getQueryData<T>(resource.queryKey(serverId)) : undefined;
  };

  const albums = byName<Album[]>('albums');
  const artists = byName<unknown[]>('artists');
  const playlists = byName<unknown[]>('playlists');
  const tracks = byName<Song[]>('tracks');
  const starred = byName<{ songs?: Song[] }>('starred');
  const genres = byName<string[]>('genres');

  return {
    // Reported in table order, not the order they were fetched in.
    failed: CATALOG_RESOURCES
      .filter(resource => !fetched.has(resource.name))
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
