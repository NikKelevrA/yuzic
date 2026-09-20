/**
 * The catalog on disk, one record per resource.
 *
 * The catalog used to ride along in the TanStack Query persister's single
 * blob (`PersistQueryClientProvider` in `app/_layout.tsx`), which is what
 * `createAsyncStoragePersister` does by default: every query in the cache,
 * `JSON.stringify`'d to one key, rewritten whenever anything in the cache
 * changes, and `JSON.parse`'d whole before the app can paint.
 *
 * That is affordable for a small library and quadratic in annoyance for a
 * large one, because the *whole* blob is paid for by *any* change. Modelled
 * on the real entity shapes, an 80,000-track library serialises to ~98 MB and
 * a 300,000-track one to ~367 MB — 0.7 s and 3.3 s just to parse, on desktop
 * V8, before Hermes and a phone's memory ceiling are accounted for. Users
 * reported 10 s cold starts at 80k and an untappable UI at 300k, which is
 * that blob being rewritten on a throttle while they tried to scroll.
 *
 * So the catalog lives here instead, in its own MMKV namespace, one record
 * per resource per server:
 *
 * - **A sync writes only what it fetched.** Six small writes on a sync
 *   replace one enormous write per second of playback.
 * - **A start reads each resource separately**, after first paint, cheapest
 *   first — see `useCatalogHydration`. The tracks list is the whale and lands
 *   last, so nothing else waits behind it.
 * - **Everything else still rides the blob**, which is now small: it holds
 *   the screens' own queries, not the library.
 *
 * What this deliberately does *not* change is where the catalog lives at
 * runtime. It is still one array per resource in the query cache, read
 * through the same keys by the same hooks, so `useAlbums`'s "the persisted
 * cache is the offline story" is still true — only the shape on disk moved.
 * A library too big to hold in memory at all needs paged reads, which is a
 * different and much larger change; this one makes the common case fast
 * without touching a single call site.
 */
import type { QueryKey } from '@tanstack/react-query';

import { catalogStorage } from '@/state/mmkvStorage';
import { CATALOG_RESOURCES } from './catalogQueries';

/** Not exported: it names the parameter below, and every caller reaches it
 *  through `CATALOG_RESOURCES` rather than by naming it. */
type CatalogResourceName = (typeof CATALOG_RESOURCES)[number]['name'];

/**
 * The first element of every catalog query key, taken from the resource table
 * rather than written out again — a second list here would be a second place
 * to update when a resource joins `CATALOG_RESOURCES`, and the cost of
 * missing one is a 98 MB blob quietly coming back.
 *
 * The server id is passed as `''` only to reach the root; it is not part of
 * what is compared.
 */
const CATALOG_QUERY_ROOTS: ReadonlySet<unknown> = new Set(
  CATALOG_RESOURCES.map(resource => resource.queryKey('')[0])
);

/** Whether a key belongs to the catalog, and so is persisted here instead of
 *  in the query persister's blob. */
export function isCatalogQuery(queryKey: QueryKey): boolean {
  return CATALOG_QUERY_ROOTS.has(queryKey[0]);
}

const recordKey = (serverId: string, name: CatalogResourceName): string =>
  `${serverId}:${name}`;

/**
 * Stores one resource's list.
 *
 * Callers pass only what a fetch actually returned. A resource whose fetch
 * rejected must not reach here: overwriting a good copy with nothing is how
 * an offline library empties itself after one failed sync.
 */
export function writeCatalogResource(
  serverId: string,
  name: CatalogResourceName,
  data: unknown
): void {
  try {
    catalogStorage.set(recordKey(serverId, name), JSON.stringify(data));
  } catch (error) {
    // A full disk or an oversized record loses this resource until the next
    // sync, which is recoverable. Failing the sync over it would not be.
    console.warn(`[catalog] could not persist ${name}`, error);
  }
}

/** One resource's list, or undefined when nothing is stored or it cannot be
 *  read. Undefined always means "ask the server", never "the library is
 *  empty". */
export function readCatalogResource<T>(
  serverId: string,
  name: CatalogResourceName
): T | undefined {
  try {
    const raw = catalogStorage.getString(recordKey(serverId, name));
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  } catch (error) {
    console.warn(`[catalog] could not read ${name}`, error);
    return undefined;
  }
}

/**
 * Drops every stored catalog.
 *
 * Signing out calls `queryClient.clear()`, which used to take the catalog
 * with it because the catalog was in the cache's blob. It is not any more, so
 * this is what keeps sign-out meaning sign-out rather than leaving the
 * previous account's library to rehydrate over the next one's.
 */
export function clearCatalog(): void {
  catalogStorage.clearAll();
}
