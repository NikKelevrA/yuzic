import type { Song } from '@/domain/entities/Song';
import { parseLocalId, type LocalId } from '@/domain/identity/LocalId';
import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import shuffleArray from '@/features/playback/shuffleArray';
import type { SimilarityService } from '@/providers/registry/similarityService';

// Tiered source for Smart Shuffle's one-shot injection and Autoplay's
// queue-end extension: a similarity service's acoustic extension when one is
// connected, otherwise the app's existing native similar-songs capability
// (Navidrome's getSimilarSongs.view or Jellyfin/Emby's InstantMix, already
// unified behind api.similar).
export interface QueueFillProvider {
  id: 'similarity-service' | 'native-similarity';
  isAvailable(): boolean;
  fetchExtension(opts: {
    /**
     * Seeds, identified the way the server that will be asked about them
     * identifies them. Both providers hand these straight back to a server —
     * the similarity service indexes the active server's own item ids, and `getSimilarSongs`
     * queries the adapter — so this is `nativeId`, not identity.
     */
    recentSongs: { nativeId: string }[];
    /**
     * What is already queued, keyed by identity rather than by native id. A
     * queue can hold tracks from more than one origin at once — imported local
     * files alongside server tracks — and two origins can easily both call
     * something `42`. Excluding on native id would drop the wrong track.
     */
    excludeIds: Set<LocalId>;
    count: number;
  }): Promise<Song[]>;
}

export function createSimilarityServiceQueueFillProvider(similarity: SimilarityService, api: ApiAdapter): QueueFillProvider {
  return {
    id: 'similarity-service',
    isAvailable: () => true,
    fetchExtension: async ({ recentSongs, excludeIds, count }) => {
      // The service ranks results deterministically by similarity, so asking
      // for exactly `count` would return the same tracks in the same order
      // every time the same seed (e.g. a favorite replayed as the starting
      // track) comes up. Over-fetch a larger pool and randomly sample from
      // it — same pattern the native provider uses — so repeat plays vary.
      const poolSize = Math.max(count * 3, 30);
      // The exclusion set is keyed by identity, but this list is sent to
      // the service, which only knows the media server's own item ids — so it has
      // to be read back down to native ids. Ids from another origin (an
      // imported local file) survive the translation and simply match nothing
      // there, which is the correct outcome: the service was never going to
      // return them anyway.
      const excludeItemIds = [...excludeIds]
        .map(id => parseLocalId(id)?.nativeId)
        .filter((id): id is string => id !== undefined);
      const itemIds = await similarity.similarTrackIds({
        seedItemIds: recentSongs.map(s => s.nativeId),
        excludeItemIds,
        limit: poolSize,
      });
      // The service returns the active media server's native item ids, not
      // full Song objects — resolve each one, dropping any that fail rather
      // than failing the whole batch.
      const resolved = await Promise.allSettled(itemIds.map(itemId => api.songs.get(itemId)));
      const songs = resolved
        .filter((r): r is PromiseFulfilledResult<Song | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((s): s is Song => s !== null && !excludeIds.has(s.localId));
      return shuffleArray(songs).slice(0, count);
    },
  };
}

export function createNativeSimilarityQueueFillProvider(api: ApiAdapter): QueueFillProvider {
  return {
    id: 'native-similarity',
    isAvailable: () => true,
    fetchExtension: async ({ recentSongs, excludeIds, count }) => {
      const seed = recentSongs[recentSongs.length - 1];
      if (!seed) return [];
      const similar = await api.similar.getSimilarSongs(seed.nativeId);
      return shuffleArray(similar.filter(s => !excludeIds.has(s.localId))).slice(0, count);
    },
  };
}

// Returns the first available provider in priority order (the similarity
// service first, native fallback last), or null if none are available.
export function resolveQueueFillProvider(providers: QueueFillProvider[]): QueueFillProvider | null {
  return providers.find(p => p.isAvailable()) ?? null;
}
