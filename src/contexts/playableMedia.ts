import type { MediaItem } from '../features/player/mediaItem';

/**
 * What's still genuinely about `MediaItem`'s own shape, plus the one
 * conversion from a `PlayableResource` into it.
 *
 * `hasPlayableMediaUrl`, `assertPlayableSongs`, `playableSongsOnly`,
 * `getSourceKind` and `hasSameQueueIds` used to live here as their own
 * `Song`-typed implementations; they are now exactly what
 * `src/features/playback/playableResource.ts` provides (`isPlayable`,
 * `assertPlayable`, `playableOnly`, `sourceKind`, `sameQueue`), so callers
 * import from there instead of duplicating the logic against a second type.
 * `mediaItemToFallbackSong` is likewise replaced by that module's
 * `resourceFromPlayerItem`, which recovers provenance from the media id
 * itself rather than only patching together display fields.
 *
 * `buildMediaItem` has gone the same way. It was a second copy of
 * `buildTrackItem` — same inputs, same output, maintained separately — and it
 * was the copy the phone queue actually called, so unifying the CarPlay and
 * browse builders behind `engineBoundary` left the most travelled path still
 * building its own. `PlayingContext` calls `buildTrackItem` now, which is the
 * boundary's own reshaping into `MediaItem`.
 */

export function getMediaItemId(item: MediaItem): string {
  return item.mediaId ?? (typeof item.url === 'string' ? item.url : '');
}

/** The player accepts a plain URL or a `{ uri }` source; normalise both. */
export function getMediaItemUrl(item: MediaItem): string {
  if (typeof item.url === 'string') return item.url;
  if (typeof item.url === 'object' && item.url && 'uri' in item.url) {
    return typeof item.url.uri === 'string' ? item.url.uri : '';
  }
  return '';
}
