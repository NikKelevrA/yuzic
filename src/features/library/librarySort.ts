import type { Album } from '@/domain/entities/Album'
import type { Artist } from '@/domain/entities/Artist'
import type { Playlist } from '@/domain/entities/Playlist'
import type { Song } from '@/domain/entities/Song'

/**
 * Ordering for the library's mixed entity list.
 *
 * The list holds albums, artists, playlists and tracks together, and not every
 * sort order means something for every kind — an artist has no release year.
 * Those fall back to zero rather than being excluded, so the list keeps every
 * item and only its position changes.
 */

export type LibraryItem =
  | { kind: 'album'; data: Album }
  | { kind: 'artist'; data: Artist }
  | { kind: 'playlist'; data: Playlist }
  | { kind: 'track'; data: Song }

/**
 * A browse destination in the library.
 *
 * The entity types, plus `downloaded` — a filter across them that answers a
 * question no entity list can: what can I play with no server.
 *
 * There is deliberately no `recentlyAdded` here. It was one, and it bought a
 * whole collection type for what is only the albums list under a different
 * sort — a screen that existed for exactly one caller and duplicated another.
 * A time ordering is a `SortOrder`, so Home's shelf opens the albums list
 * already sorted that way, and the sort control still says so.
 */
export type LibraryCollectionType =
  | 'playlists'
  | 'albums'
  | 'artists'
  | 'tracks'
  | 'downloaded'

export type SortOrder = 'title' | 'recent' | 'userplays' | 'year' | 'recentlyAdded'

type StatsMap = Record<string, number>

export interface SortStats {
  songLastPlayed: StatsMap
  songPlays: StatsMap
  albumLastPlayed: StatsMap
  albumPlays: StatsMap
  artistLastPlayed: StatsMap
  artistPlays: StatsMap
  playlistLastPlayed: StatsMap
  playlistPlays: StatsMap
}

/**
 * Stable empty stats for the sort orders that don't read play data (title,
 * year, recentlyAdded). Keeping one constant reference stops the sorted list
 * recomputing every time a play count changes while the user is on one of them.
 */
export const EMPTY_SORT_STATS: SortStats = {
  songLastPlayed: {},
  songPlays: {},
  albumLastPlayed: {},
  albumPlays: {},
  artistLastPlayed: {},
  artistPlays: {},
  playlistLastPlayed: {},
  playlistPlays: {},
}

/** Sort orders that read play statistics, and so need the live stats object. */
export function usesPlayStats(order: SortOrder): boolean {
  return order === 'recent' || order === 'userplays'
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

function displayName(item: LibraryItem): string {
  return item.kind === 'artist' ? item.data.name : item.data.title
}

function releaseYear(item: LibraryItem): number {
  if (item.kind === 'album' || item.kind === 'track') return item.data.year ?? 0
  return 0
}

// The stats maps (`SortStats`) are keyed by the origin's own id — see
// `useScrobbling`'s `incrementPlay` dispatch, which records `song.nativeId`/
// `album.nativeId`/`artist.nativeId` and the playlist's `nativeId` from the
// queue's `CollectionContext` — so lookups here read `nativeId` too, never
// `localId`. Playlists sort by when they were played, like everything else:
// Home's Recently Played shelf opens this order, and sorting playlists by
// their last edit instead made the list disagree with the shelf.
function lastPlayedAt(item: LibraryItem, stats: SortStats): number {
  if (item.kind === 'album') return stats.albumLastPlayed[item.data.nativeId] ?? 0
  if (item.kind === 'track') return stats.songLastPlayed[item.data.nativeId] ?? 0
  if (item.kind === 'artist') return stats.artistLastPlayed[item.data.nativeId] ?? 0
  if (item.kind === 'playlist') return stats.playlistLastPlayed[item.data.nativeId] ?? 0
  return 0
}

function playCount(item: LibraryItem, stats: SortStats): number {
  if (item.kind === 'track') return stats.songPlays[item.data.nativeId] ?? 0
  if (item.kind === 'album') return stats.albumPlays[item.data.nativeId] ?? 0
  if (item.kind === 'artist') return stats.artistPlays[item.data.nativeId] ?? 0
  if (item.kind === 'playlist') return stats.playlistPlays[item.data.nativeId] ?? 0
  return 0
}

function addedAt(item: LibraryItem): number {
  if (item.kind === 'album') return item.data.addedAt ?? 0
  if (item.kind === 'playlist') return item.data.createdAt ?? 0
  if (item.kind === 'track') return item.data.addedAt ?? 0
  return 0
}

export function sortItems(
  items: LibraryItem[],
  order: SortOrder,
  stats: SortStats
): LibraryItem[] {
  const sorted = [...items]
  switch (order) {
    case 'title':
      return sorted.sort((a, b) => collator.compare(displayName(a), displayName(b)))
    case 'year':
      return sorted.sort((a, b) => releaseYear(b) - releaseYear(a))
    case 'recent':
      return sorted.sort((a, b) => lastPlayedAt(b, stats) - lastPlayedAt(a, stats))
    case 'userplays':
      return sorted.sort((a, b) => playCount(b, stats) - playCount(a, stats))
    case 'recentlyAdded':
      return sorted.sort((a, b) => addedAt(b) - addedAt(a))
    default:
      return sorted
  }
}
