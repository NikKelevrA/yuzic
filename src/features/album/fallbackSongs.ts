import type { Song } from '@/domain/entities/Song';

/**
 * An album's tracks in running order: disc, then track number.
 *
 * This used to take the whole library and filter it by the album's
 * `nativeId`, a pass over every track for one album. Finding the tracks is
 * the catalog store's job now (`songsByAlbumNativeId`), so what is left here
 * is the part that was always this file's own: the order. A track with no
 * number sorts last rather than first, so an untagged bonus track does not
 * open the album.
 */
export function inRunningOrder(songs: readonly Song[]): Song[] {
  return songs.slice().sort((a, b) => {
    const discA = a.discNumber ?? 1;
    const discB = b.discNumber ?? 1;
    if (discA !== discB) return discA - discB;
    const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER;
    const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER;
    return trackA - trackB;
  });
}
