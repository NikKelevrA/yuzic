import type { CollectionContext } from '@/domain/playback/CollectionContext'
import type { MediaItem } from '@/features/player/mediaItem'
import type { PlayableResource } from '@/features/playback/playableResource'
import { resourceFromPlayerItem } from '@/features/playback/playableResource'
import { getMediaItemId, getMediaItemUrl } from './playableMedia'
import { knownResource } from './knownResources'

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

type PlayNextQueueUpdate<T> = {
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

export function tagSegment(
  segments: QueueSegment[],
  startIndex: number,
  length: number,
  source: QueueSegmentSource,
): QueueSegment[] {
  if (length <= 0) return segments
  return [...segments, { startIndex, length, source }]
}

// Segments starting at or after `atIndex` shift right by `insertedCount`;
// segments entirely before it are untouched; a segment that *spans* the insert
// point is split in two around it.
//
// The third case used to be missing, and it is the one "play next" hits every
// time: inserting after the current track means inserting into the middle of
// whatever album or playlist is playing. The spanning segment was neither
// shifted nor lengthened, so it went on claiming the same three slots — which
// after the insert were a different three. The inserted track was reported as
// part of the album, and the album's last track was reported as outside it.
// Smart Shuffle read that as "this track is already in the selection" and
// Smooth Transitions drew a context boundary in the wrong place.
//
// Splitting rather than growing, because the inserted track is genuinely not
// part of the album it landed in. Growing would also not work: `segmentAt`
// resolves an index to the first covering segment, and `tagSegment` appends,
// so a grown album segment would win over the adhoc tag written afterwards.
export function shiftSegmentsAfterInsert(
  segments: QueueSegment[],
  atIndex: number,
  insertedCount: number,
): QueueSegment[] {
  if (insertedCount <= 0) return segments
  return segments.flatMap(seg => {
    if (seg.startIndex >= atIndex) {
      return [{ ...seg, startIndex: seg.startIndex + insertedCount }]
    }
    const segEnd = seg.startIndex + seg.length
    if (segEnd <= atIndex) return [seg]

    // Spans the insert point: the part before it stays, the part after it
    // moves along by what was inserted.
    const headLength = atIndex - seg.startIndex
    return [
      { ...seg, length: headLength },
      {
        ...seg,
        startIndex: atIndex + insertedCount,
        length: seg.length - headLength,
      },
    ]
  })
}


export function segmentAt(segments: QueueSegment[], index: number): QueueSegment | undefined {
  return segments.find(seg => index >= seg.startIndex && index < seg.startIndex + seg.length)
}

/** The album or playlist a segment's tracks were chosen from, if any. */
export function collectionContextOf(source: QueueSegmentSource | undefined): CollectionContext | null {
  if (source?.kind !== 'user' || source.contextType === 'adhoc') return null
  return { contextId: source.contextId, contextType: source.contextType }
}

const sameContext = (a: CollectionContext | null, b: CollectionContext | null) =>
  a?.contextId === b?.contextId && a?.contextType === b?.contextType

/** A segment for tracks from `context`, or an ad-hoc one when they came from none. */
export function collectionSegment(
  startIndex: number,
  length: number,
  context: CollectionContext | null,
  adhocContextId: string,
): QueueSegment {
  return {
    startIndex,
    length,
    source: context
      ? { kind: 'user', ...context }
      : { kind: 'user', contextId: adhocContextId, contextType: 'adhoc' },
  }
}

// The one album or playlist every segment of a queue came from, or null when
// the queue holds anything else. A reorder that erases segment boundaries — a
// shuffle — can carry this across, because every track still came from it; a
// mixed queue cannot, since after the reorder nothing says which track was which.
export function soleCollectionContext(segments: QueueSegment[]): CollectionContext | null {
  const first = collectionContextOf(segments[0]?.source)
  if (!first) return null
  return segments.every(seg => sameContext(collectionContextOf(seg.source), first)) ? first : null
}

// Segments for a queue whose tracks each remember their collection, as a
// persisted queue does: consecutive tracks from the same collection share a
// segment, and consecutive tracks from none share one ad-hoc segment.
export function segmentsFromContexts(
  contexts: (CollectionContext | null)[],
  adhocContextId: string,
): QueueSegment[] {
  const segments: QueueSegment[] = []
  contexts.forEach((context, index) => {
    const last = segments[segments.length - 1]
    if (last && sameContext(collectionContextOf(last.source), context)) {
      last.length += 1
      return
    }
    segments.push(collectionSegment(index, 1, context, adhocContextId))
  })
  return segments
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
  inMemory: PlayableResource[]
): PlayableResource[] {
  const byId = new Map<string, PlayableResource>();
  for (const resource of inMemory) {
    if (!byId.has(resource.song.localId)) byId.set(resource.song.localId, resource);
  }

  return items
    .map(item => {
      const id = getMediaItemId(item);
      // A song offered to the car is known in full even when the app never
      // queued it; the player's own item is the last resort.
      return byId.get(id) ?? knownResource(id) ?? resourceFromMediaItem(item);
    })
    .filter((resource): resource is PlayableResource => Boolean(resource));
}
