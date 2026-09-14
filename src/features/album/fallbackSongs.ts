import type { Song } from '@/domain/entities/Song';

/**
 * Reconstructs an album's track list from the synced library tracks when the
 * server can't be asked (offline or unreachable).
 *
 * Matches on the album's `nativeId`, not `localId`: every call site here
 * (`useAlbum`) already has the id it was called with — the origin's own
 * album id — and the synced library this reads from is always scoped to one
 * active server at a time, so a `nativeId` collision across origins can't
 * happen. Unlike the pre-rewrite version, there's no `streamUrl` to
 * fabricate here — the domain `Song` doesn't carry one; the player boundary
 * (`usePlayableSongResolver`) builds a real one lazily when a track is
 * actually played.
 */
export function buildFallbackAlbumSongs(tracks: Song[], albumNativeId: string): Song[] {
  if (!albumNativeId) return [];
  return tracks
    .filter(t => t.album.nativeId === albumNativeId)
    .slice()
    .sort((a, b) => {
      const discA = a.discNumber ?? 1;
      const discB = b.discNumber ?? 1;
      if (discA !== discB) return discA - discB;
      const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
      const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
      return trackA - trackB;
    });
}
