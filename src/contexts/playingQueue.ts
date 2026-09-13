import type { MediaItem } from '@/features/player/mediaItem'
import type { PlayableResource } from '@/features/playback/playableResource'
import { resourceFromPlayerItem } from '@/features/playback/playableResource'
import { getMediaItemId, getMediaItemUrl } from './playableMedia'

/**
 * `resourceFromPlayerItem` wants a plain string url; `MediaItem.url` is the
 * player's own `string | { uri }` shape, so this reads it through the same
 * helper every other reader of that field uses.
 */
export function resourceFromMediaItem(item: MediaItem): PlayableResource | null {
  return resourceFromPlayerItem({
    mediaId: item.mediaId,
    url: getMediaItemUrl(item),
    title: item.title,
    artist: item.artist,
    duration: item.duration,
  })
}

export type PlayNextQueueUpdate<T> = {
  queue: T[]
  currentIndex: number
  insertIndex: number
  removedIndex: number | null
}

// Generic over the queue's entry type and keyed by an explicit `getId` rather
// than an `{ id: string }` constraint: the queue now holds `PlayableResource`,
// which has no `id` field of its own — its identity is `song.localId` — and a
// queue can hold entries from more than one origin at once, where only that
// branded identity (not `nativeId`) is guaranteed not to collide.
export function moveSongAfterCurrent<T>(
  queue: T[],
  currentIndex: number,
  song: T,
  getId: (item: T) => string,
): PlayNextQueueUpdate<T> | null {
  const current = queue[currentIndex]
  if (!current || getId(current) === getId(song)) return null

  const songId = getId(song)
  const removedIndex = queue.findIndex(item => getId(item) === songId)
  const withoutSong = removedIndex === -1
    ? [...queue]
    : queue.filter(item => getId(item) !== songId)

  const currentId = getId(current)
  const adjustedCurrentIndex = withoutSong.findIndex(item => getId(item) === currentId)
  if (adjustedCurrentIndex === -1) return null

  const insertIndex = adjustedCurrentIndex + 1
  withoutSong.splice(insertIndex, 0, song)

  return {
    queue: withoutSong,
    currentIndex: adjustedCurrentIndex,
    insertIndex,
    removedIndex: removedIndex === -1 ? null : removedIndex,
  }
}

// Restoring a pre-shuffle snapshot verbatim would silently drop anything
// added to the live (shuffled) queue since shuffling started, and resurrect
// anything removed from it (e.g. a track dropped after a playback failure).
// Keep snapshot entries still present in the live queue, then append
// whatever's in the live queue that the snapshot doesn't know about.
export function reconcileUnshuffledQueue<T>(
  originalQueue: T[],
  liveQueue: T[],
  getId: (item: T) => string,
): T[] {
  const liveIds = new Set(liveQueue.map(getId))
  const restoredBase = originalQueue.filter(item => liveIds.has(getId(item)))
  const restoredIds = new Set(restoredBase.map(getId))
  const addedWhileShuffled = liveQueue.filter(item => !restoredIds.has(getId(item)))
  return [...restoredBase, ...addedWhileShuffled]
}

// Queue-provenance tracking: which contiguous index range a queue entry came
// from, and why. Tracked as segments over the queue rather than tags on each
// Song, so the Song type (used across API responses, downloads, cast) stays
// untouched. Smart Shuffle needs to know what's outside the original
// selection; Smooth Transitions needs to know where one context ends and an
// unrelated one begins — both read off the same segment list.
export type QueueSegmentSource =
  | { kind: 'user'; contextId: string; contextType: 'album' | 'playlist' | 'adhoc' }
  | { kind: 'autoplay-fill'; contextId: string }
  | { kind: 'transition-bridge'; fromContextId: string; toContextId: string }

export type QueueSegment = {
  startIndex: number
  length: number
  source: QueueSegmentSource
}

function contextIdOf(source: QueueSegmentSource): string {
  return source.kind === 'transition-bridge' ? `${source.fromContextId}->${source.toContextId}` : source.contextId
}

export function tagSegment(
  segments: QueueSegment[],
  startIndex: number,
  length: number,
  source: QueueSegmentSource,
): QueueSegment[] {
  if (length <= 0) return segments
  return [...segments, { startIndex, length, source }]
}

// Every segment starting at or after `atIndex` shifts right by `insertedCount`.
export function shiftSegmentsAfterInsert(
  segments: QueueSegment[],
  atIndex: number,
  insertedCount: number,
): QueueSegment[] {
  if (insertedCount <= 0) return segments
  return segments.map(seg =>
    seg.startIndex >= atIndex
      ? { ...seg, startIndex: seg.startIndex + insertedCount }
      : seg
  )
}

// Segments entirely before the removed range are untouched, segments entirely
// after shift left by `removedCount`, and segments overlapping the removed
// range shrink by the overlap (dropped entirely if nothing survives).
export function shiftSegmentsAfterRemove(
  segments: QueueSegment[],
  atIndex: number,
  removedCount: number,
): QueueSegment[] {
  if (removedCount <= 0) return segments
  const removedEnd = atIndex + removedCount
  return segments
    .map(seg => {
      const segEnd = seg.startIndex + seg.length
      if (segEnd <= atIndex) return seg
      if (seg.startIndex >= removedEnd) return { ...seg, startIndex: seg.startIndex - removedCount }
      const overlapStart = Math.max(seg.startIndex, atIndex)
      const overlapEnd = Math.min(segEnd, removedEnd)
      const overlap = overlapEnd - overlapStart
      return {
        ...seg,
        startIndex: seg.startIndex < atIndex ? seg.startIndex : atIndex,
        length: seg.length - overlap,
      }
    })
    .filter(seg => seg.length > 0)
}

export function segmentAt(segments: QueueSegment[], index: number): QueueSegment | undefined {
  return segments.find(seg => index >= seg.startIndex && index < seg.startIndex + seg.length)
}

export function isContextBoundary(segments: QueueSegment[], index: number): boolean {
  if (index <= 0) return false
  const prev = segmentAt(segments, index - 1)
  const curr = segmentAt(segments, index)
  if (!prev || !curr) return false
  return contextIdOf(prev.source) !== contextIdOf(curr.source)
}

// Returns the nearest index >= fromIndex where isContextBoundary is true, or
// null if none exists in the remaining queue.
export function findNextBoundaryIndex(segments: QueueSegment[], fromIndex: number): number | null {
  const maxIndex = segments.reduce((max, seg) => Math.max(max, seg.startIndex + seg.length), 0)
  for (let i = Math.max(fromIndex, 1); i < maxIndex; i++) {
    if (isContextBoundary(segments, i)) return i
  }
  return null
}

/**
 * The player's queue, expressed as the app's own resources.
 *
 * The engine owns which tracks are queued and in what order — it applies every
 * edit itself, and it is the only one that knows about the changes this app did
 * not make: a skip from the lock screen, a track it dropped because it could
 * not be opened, a queue restored into a fresh JavaScript context. What it
 * cannot hand back is what each track *is*; the resolved stream URL and the
 * request headers were the app's, and they never crossed the bridge.
 *
 * So order and membership come from `items`, and the content of each one is
 * looked up in what the app already holds. The in-memory queue is preferred
 * over anything else because its URLs are the freshest — a stream URL carries
 * a token that goes stale — and rebuilding from the player's own item is the
 * last resort, recovering provenance and the origin's id by parsing the media
 * id itself.
 *
 * Exported for its tests. This is the point where the two queues are made to
 * agree, and getting it wrong looks like the wrong song playing after a
 * remove rather than like an error.
 */
export function resourcesFromPlayerQueue(
  items: MediaItem[],
  inMemory: PlayableResource[],
  library: Map<string, PlayableResource>
): PlayableResource[] {
  const byId = new Map<string, PlayableResource>();
  for (const resource of inMemory) {
    if (!byId.has(resource.song.localId)) byId.set(resource.song.localId, resource);
  }

  return items
    .map(item => {
      const id = getMediaItemId(item);
      return byId.get(id) ?? library.get(id) ?? resourceFromMediaItem(item);
    })
    .filter((resource): resource is PlayableResource => Boolean(resource));
}
