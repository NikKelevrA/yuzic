import type { Album } from '@/domain/entities/Album';
import { useCatalogStore } from '@/features/library/useCatalogStore';

/**
 * O(1) lookup over the album catalog, keyed by `nativeId` — see
 * `useSongsById` for why that is collision-safe here.
 *
 * This used to build its own `new Map(albums.map(...))`, which is an index
 * over the whole library rebuilt inside every component that wanted one, and
 * there were nine of them. The store builds it once for the app.
 */
export function useAlbumsById(): ReadonlyMap<string, Album> {
  return useCatalogStore().albumByNativeId;
}
