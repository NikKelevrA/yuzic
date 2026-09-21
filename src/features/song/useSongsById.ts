import type { Song } from '@/domain/entities/Song';
import { useCatalogStore } from '@/features/library/useCatalogStore';

/**
 * O(1) lookup over the track catalog, keyed by `nativeId`: every caller looks
 * a song up by the id it already has from an origin-facing call (a queue
 * entry, a download record, ...), and the catalog is always scoped to one
 * active server at a time, so a `nativeId` collision across origins cannot
 * occur.
 *
 * This used to build its own `new Map(tracks.map(...))` — an index over every
 * track in the library, rebuilt inside each component that wanted one. The
 * store builds it once for the app.
 */
export function useSongsById(): ReadonlyMap<string, Song> {
  return useCatalogStore().songByNativeId;
}
