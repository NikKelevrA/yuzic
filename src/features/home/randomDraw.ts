import type { Song } from '@/domain/entities/Song'
import type { LocalId } from '@/domain/identity/LocalId'

/**
 * One song per album, in the order drawn.
 *
 * A server's random draw is over *songs*, so a library where one album has two
 * hundred tracks and the rest have ten returns that album over and over — the
 * shelf came back as three identical covers in a row, which reads as a bug
 * rather than as a shuffle. Narrow genre filters make it worse, because the
 * whole matching pool can be a single release.
 *
 * Thinning to one per album makes the row look like the surprise it claims to
 * be. Songs with no album (an empty `album.nativeId`) can't be grouped, so
 * each stands alone. Grouping itself compares `album.localId` — an equality
 * check between loaded entities, never the origin id, which two origins
 * could coincidentally share.
 */
export function onePerAlbum(songs: readonly Song[]): Song[] {
  const seen = new Set<LocalId>()
  const result: Song[] = []
  for (const song of songs) {
    if (song.album.nativeId) {
      if (seen.has(song.album.localId)) continue
      seen.add(song.album.localId)
    }
    result.push(song)
  }
  return result
}
