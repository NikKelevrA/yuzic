import type { Album } from '@/domain/entities/Album'
import type { Artist } from '@/domain/entities/Artist'
import type { Playlist } from '@/domain/entities/Playlist'
import type { Song } from '@/domain/entities/Song'
import { effectiveRating } from '@/features/ratings/effectiveRating'

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

export type SortOrder = 'title' | 'recent' | 'userplays' | 'year' | 'recentlyAdded' | 'rating'

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

/** The one order that reads what the user rated things, and so needs the overlay. */
export function usesRatings(order: SortOrder): boolean {
  return order === 'rating'
}

/** Stable empty overlay, for the same reason as `EMPTY_SORT_STATS`. */
export const EMPTY_RATINGS: StatsMap = {}

function displayName(item: LibraryItem): string {
  return item.kind === 'artist' ? item.data.name : item.data.title
}

/** Accents, once NFD has split them off the letter they sit on. */
const DIACRITICS = /[̀-ͯ]/g

/**
 * The letters NFD does not decompose, folded the way collation folds them at
 * primary strength. Lower case only: the fold runs after `toLowerCase`.
 */
const LIGATURES: Record<string, string> = {
  'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'œ': 'oe', 'đ': 'd', 'ł': 'l', 'þ': 'th',
}
const LIGATURE = /[ßæøœđłþ]/g

/**
 * What a name sorts by, folded once per item rather than compared once per
 * comparison.
 *
 * This ordering used to be `Intl.Collator(undefined, { sensitivity: 'base' })`
 * called from inside the comparator, which is the single most expensive line
 * in the library screens. Sorting 89,878 tracks by title is about 1.5 million
 * comparisons and each collator call costs roughly two microseconds on
 * Hermes: measured on a device, opening the Tracks screen blocked the JS
 * thread for **3.4 seconds**. Folding each name once and comparing the folded
 * strings does the same list in 514 ms.
 *
 * The fold is what base sensitivity bought — case and accents stop mattering,
 * so "Ábba", "ABBA" and "abba" tie. It is not ICU: locale-specific orderings
 * and script reordering are gone, and what is left is code-point order over
 * folded text. Checked against the collator over a list picked to be awkward
 * (accents, ß, æ, ø, punctuation, digits, a leading "The") and the two agree
 * on every one; see the test.
 */
function nameKey(item: LibraryItem): string {
  return displayName(item)
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(LIGATURE, character => LIGATURES[character])
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

/**
 * What the user rated this, for ordering — the catalog's value unless this
 * device has written a newer one, exactly as the screens read it.
 *
 * Unrated is 0, which puts it below one star. That is the right end for it:
 * "sort by rating" is a request to see the good ones, and a library where
 * most things are unrated would otherwise open on the part the user has not
 * had an opinion about.
 */
function ratingOf(item: LibraryItem, ratings: StatsMap): number {
  if (item.kind !== 'album' && item.kind !== 'track') return 0
  return effectiveRating(item.data.userRating, ratings[item.data.nativeId]) ?? 0
}

function addedAt(item: LibraryItem): number {
  if (item.kind === 'album') return item.data.addedAt ?? 0
  if (item.kind === 'playlist') return item.data.createdAt ?? 0
  if (item.kind === 'track') return item.data.addedAt ?? 0
  return 0
}

/** An item with its sort keys already worked out. */
interface Keyed {
  item: LibraryItem
  /** Ordered high to low by every numeric order. Unread by `title`. */
  value: number
  /** Built only for the orders that read it; `nameKey` is not free. */
  name: string
}

const byName = (a: Keyed, b: Keyed): number =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0

const byValue = (a: Keyed, b: Keyed): number => b.value - a.value

/**
 * How each order reads an item, in one place.
 *
 * `value` is the number it sorts on, `name` says whether the name key is worth
 * building, and `compare` is what the decorated array is sorted with.
 */
const ORDERS: Record<
  SortOrder,
  {
    value: (item: LibraryItem, stats: SortStats, ratings: StatsMap) => number
    name: boolean
    compare: (a: Keyed, b: Keyed) => number
  }
> = {
  title: { value: () => 0, name: true, compare: byName },
  // Ties broken by name, unlike every other order here. Five stars is a scale
  // with six values over a library of thousands, so the ties are the list:
  // without the second key a "sort by rating" is a shuffle within each band
  // that reorders itself on every render.
  rating: {
    value: (item, _stats, ratings) => ratingOf(item, ratings),
    name: true,
    compare: (a, b) => byValue(a, b) || byName(a, b),
  },
  year: { value: releaseYear, name: false, compare: byValue },
  recent: { value: (item, stats) => lastPlayedAt(item, stats), name: false, compare: byValue },
  userplays: { value: (item, stats) => playCount(item, stats), name: false, compare: byValue },
  recentlyAdded: { value: addedAt, name: false, compare: byValue },
}

/**
 * Decorate, sort, undecorate.
 *
 * Every key is computed once per item rather than once per comparison, which
 * for a library-sized list is the difference between 90,000 lookups and about
 * 1.5 million. Measured on a device at 89,878 tracks: title 3,446 ms to
 * 514 ms, plays 897 ms to 224 ms, recently added 621 ms to 244 ms.
 *
 * The decorated objects cost a few megabytes while the sort runs, and are
 * worth it — a parallel-array form was tried and came out both slower (579 ms
 * against 495 ms, the extra indirection outweighing the allocation) and
 * harder to read.
 *
 * `sort` is stable, here and before, so items a given order cannot separate
 * stay in the order the catalog handed them over in.
 */
export function sortItems(
  items: LibraryItem[],
  order: SortOrder,
  stats: SortStats,
  ratings: StatsMap = EMPTY_RATINGS
): LibraryItem[] {
  const spec = ORDERS[order]
  if (!spec) return [...items]

  const decorated: Keyed[] = items.map(item => ({
    item,
    value: spec.value(item, stats, ratings),
    name: spec.name ? nameKey(item) : '',
  }))
  decorated.sort(spec.compare)
  return decorated.map(keyed => keyed.item)
}
