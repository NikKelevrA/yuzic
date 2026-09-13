import type { MediaItem } from './mediaItem';
import type { BrowseItem } from './browse';
import type { BrowseNode, EngineEvent, Progress, Track } from 'yuzic-engine';

/**
 * yuzic-engine, wearing the shape the app already talks to.
 *
 * The app has ~40 `TrackPlayer.*` call sites across seven files, and rewriting
 * them to swap engines would be one enormous change that either works or does
 * not. This is the alternative: one module that answers the same calls, so the
 * swap becomes a choice of backend rather than a rewrite, and the two can be
 * compared on the same device by flipping it.
 *
 * **The obstacle this exists to solve is that the two APIs disagree about
 * time.** `TrackPlayer.getProgress()` returns a value; the engine returns a
 * promise, because it has to cross a bridge. Call sites like
 * `Math.floor(TrackPlayer.getProgress().position)` cannot be made async
 * without touching every one of them, which is the change this is avoiding.
 *
 * So the backend keeps a shadow — the last progress the engine reported, the
 * queue as it was last set, the index as of the last track change — and the
 * synchronous getters read from that. It is a cache of things the engine has
 * already said, not a guess: the engine pushes progress about four times a
 * second and pushes every track change, so the shadow is never far behind, and
 * the figures it serves were true when they were sent.
 *
 * What that costs is honesty about staleness, and it is worth stating plainly:
 * a `getProgress()` immediately after `seekTo()` returns the position before
 * the seek, until the next progress event lands. rntp has the same property
 * for the same reason — its "synchronous" getter is reading a cache the native
 * side pushes into — so this is not a regression, but it is a thing to know.
 */

/** The queue as the app hands it over, kept so the sync getters can answer. */
export interface Shadow {
  queue: MediaItem[];
  activeIndex: number;
  progress: Progress;
  playing: boolean;
}

const EMPTY_PROGRESS: Progress = { positionSec: 0, durationSec: 0, bufferedSec: 0 };

export function createShadow(): Shadow {
  return { queue: [], activeIndex: 0, progress: EMPTY_PROGRESS, playing: false };
}

/**
 * Fold an engine event into the shadow, returning the next one.
 *
 * Pure, and separated from the module that owns a shadow, because this is the
 * part worth testing: every synchronous answer the app gets is derived from
 * whatever this function last decided, so a mistake here is a progress bar
 * that lies rather than an error anyone sees.
 */
export function applyEvent(shadow: Shadow, event: EngineEvent): Shadow {
  switch (event.type) {
    case 'progress':
      return { ...shadow, progress: event.progress };

    case 'trackChange':
      // Position resets with the track. Carrying the old one forward would
      // show the new track starting wherever the last one ended, for the
      // fraction of a second until the next progress event corrects it —
      // visible as a jump backwards on every track change.
      return {
        ...shadow,
        activeIndex: event.index,
        progress: { ...EMPTY_PROGRESS, durationSec: shadow.queue[event.index]?.duration ?? 0 },
      };

    case 'stateChange':
      return { ...shadow, playing: event.state === 'playing' };

    default:
      // queueChange carries no payload — what it means for the shadow is
      // `reconcileQueue`, which has to ask the engine and so cannot happen in
      // a pure fold. error/remoteCommand are the host's business.
      return shadow;
  }
}

/**
 * Replace the shadow's queue with the engine's, keeping the app's own items.
 *
 * Two things know what is in the queue, and they are not equals. The engine
 * owns membership and order: it is what actually plays, it applies an insert
 * or a move itself, and it resolves the cases the app cannot see — a remote
 * command from the lock screen, a track dropped because it could not be
 * opened, a queue restored into a fresh JavaScript context. The app owns what
 * each item *is*: it built the `MediaItem`, with the URL it resolved and the
 * headers it attached, and the engine cannot hand any of that back.
 *
 * So this takes order and membership from `engineIds` and looks each one up in
 * what the app already has. Before it existed, both sides did the splice
 * arithmetic separately and were expected to agree — and a disagreement did
 * not announce itself, it showed up later as the wrong song playing after a
 * remove, or an index pointing one track off.
 *
 * An id the app has never seen becomes a stub carrying only its identity,
 * which is genuinely all the engine said about it. That is not a normal case —
 * every track in the engine's queue was put there by this app — but a restore
 * after the JavaScript context reloaded can reach it, and dropping the item
 * instead would leave the two queues different lengths, which is the one
 * outcome that makes every index after it wrong.
 */
export function reconcileQueue(
  shadow: Shadow,
  engineIds: string[],
  activeIndex: number
): Shadow {
  const known = new Map<string, MediaItem>();
  for (const item of shadow.queue) {
    if (item.mediaId != null && !known.has(item.mediaId)) known.set(item.mediaId, item);
  }

  const queue = engineIds.map(id => known.get(id) ?? { mediaId: id, url: '' });
  // Clamped rather than trusted: an index past the end would make
  // `getActiveMediaItem` undefined and every caller of it wrong at once.
  const clamped = queue.length === 0
    ? 0
    : Math.min(Math.max(activeIndex, 0), queue.length - 1);

  return { ...shadow, queue, activeIndex: clamped };
}

/**
 * The URL, as a string the engine can open.
 *
 * rntp's `MediaUrl` is three things: a string, `{ uri }` (which
 * `buildTrackItem` produces for local files), or a **number** — a bundled
 * asset from `require('./sound.mp3')`. The engine fetches over HTTP or reads
 * `file://` and has no notion of the bundle, so a numeric asset has no
 * translation.
 *
 * Empty string rather than a throw: yuzic never builds one, so this is a
 * shape the type permits and the app does not use, and failing the whole
 * queue over an item that cannot occur would be the worse trade. It surfaces
 * as a playback error on that track if it ever does.
 */
function engineUri(url: MediaItem['url'] | undefined): string {
  if (typeof url === 'string') return url;
  if (typeof url === 'number') return '';
  if (url && typeof url.uri === 'string') return url.uri;
  return '';
}

/**
 * The subset of `MediaItem` this needs, shared with `BrowseItem` (see
 * `toBrowseNode` below) so a browse-tree row converts to a wire `Track`
 * through this exact function rather than a second hand-rolled copy of it —
 * which is how the browse tree's `playable` track used to lose the
 * `artworkUri` that the queue's version always carried.
 */
interface EngineTrackInput {
  mediaId?: string;
  url: MediaItem['url'];
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
  duration?: number;
  headers?: Record<string, string>;
  artworkHeaders?: Record<string, string>;
}

/**
 * The app's `MediaItem` (or a `BrowseItem` row) as the engine's `Track`.
 */
export function toEngineTrack(item: EngineTrackInput): Track {
  const uri = engineUri(item.url);
  return {
    // `mediaId` is optional to rntp and always set by `buildTrackItem`, but the
    // engine keys its disk cache on this — so falling back to the URL keeps a
    // track that omits one cacheable under *something* stable, rather than
    // every such track sharing the empty-string entry.
    id: item.mediaId ?? uri,
    uri,
    title: item.title ?? '',
    artist: item.artist,
    album: item.albumTitle || undefined,
    artworkUri: engineUri(item.artworkUrl) || undefined,
    // Absent, not zero: the engine treats an unknown duration differently from
    // a zero one when it clamps a crossfade.
    durationSec: item.duration,
    // Ephemeral request headers for a header-authenticated server (Plex behind
    // a Basic-auth proxy). Two distinct fields: the engine fetches the stream
    // and the artwork independently. Set only when present, so an unprotected
    // server's Track is byte-for-byte what it was.
    ...(item.headers ? { headers: item.headers } : {}),
    ...(item.artworkHeaders ? { artworkHeaders: item.artworkHeaders } : {}),
  };
}

/** And back, for the queue getter the app reads synchronously. */
export function toMediaItem(track: Track): MediaItem {
  return {
    mediaId: track.id,
    title: track.title,
    artist: track.artist,
    albumTitle: track.album ?? '',
    duration: track.durationSec,
    url: track.uri,
    artworkUrl: track.artworkUri,
    ...(track.headers ? { headers: track.headers } : {}),
    ...(track.artworkHeaders ? { artworkHeaders: track.artworkHeaders } : {}),
  };
}

/**
 * The progress shape the app expects, from the engine's.
 *
 * Two renames and one semantic difference. The engine reports `bufferedSec` on
 * the same timeline as the position — 14 means "buffered up to 0:14" — whereas
 * a caller asking "how much runway is left" wants the difference. Converted
 * here rather than changed in the engine, because absolute is the right answer
 * for drawing a buffering bar and this is the one caller that wants otherwise.
 */
export function toPlaybackProgress(progress: Progress): {
  position: number;
  duration: number;
  buffered: number;
} {
  return {
    position: progress.positionSec,
    duration: progress.durationSec,
    buffered: Math.max(0, progress.bufferedSec - progress.positionSec),
  };
}

/**
 * One browse row, as the engine wants it.
 *
 * A row with a `url` becomes playable; one without becomes a folder and its
 * children are converted the same way. The app produces both, and which one a
 * row is cannot be told from its position in the tree — an album row and the
 * track rows beneath it sit at different depths in different categories.
 */
/** `BrowseItem` with `url` narrowed to present, for the one call site above. */
function toEngineTrackInput(item: BrowseItem, url: string): EngineTrackInput {
  return {
    mediaId: item.mediaId,
    url,
    title: item.title,
    artist: item.artist,
    artworkUrl: item.artworkUrl,
    duration: item.duration,
    headers: item.headers,
    artworkHeaders: item.artworkHeaders,
  };
}

export function toBrowseNode(item: BrowseItem): BrowseNode {
  return {
    id: item.mediaId,
    title: item.title,
    subtitle: item.artist,
    // The row's own thumbnail — not the same as `playable`'s artwork, since a
    // folder has one and nothing to play. Neither was sent at all before, so
    // the car drew titles with no covers. Headers go with it, or a protected
    // server answers 401 for every one; see `BrowseItem.artworkHeaders`.
    artworkUri: item.artworkUrl,
    ...(item.artworkHeaders ? { artworkHeaders: item.artworkHeaders } : {}),
    children: item.children?.map(toBrowseNode),
    // Same `toEngineTrack` the queue uses — see `EngineTrackInput` — so a
    // playable browse row and a queued track agree on every field, artwork
    // and headers included, instead of the browse tree hand-building a
    // second, thinner copy of the same conversion.
    playable: item.url ? toEngineTrack(toEngineTrackInput(item, item.url)) : undefined,
  };
}
