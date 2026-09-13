import type { MediaItem } from '../features/player/mediaItem';
import type { RequestHeaders } from '../features/player/mediaHeaders';
import type { PlayableResource } from '@/features/playback/playableResource';
import { buildCover } from '@/utils/builders/buildCover';
import { normalizeMediaUrl } from '@/utils/builders/buildTrackItem';

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

/**
 * Builds the `MediaItem` the native player receives for one resource.
 *
 * `mediaId` is the song's `localId`, not `nativeId`: `resourceFromPlayerItem`
 * parses provenance and the origin's own id back out of whatever the player
 * echoes back as its media id, and that only works if this is what gets
 * handed to it in the first place.
 */
export function buildMediaItem(resource: PlayableResource, extra?: RequestHeaders): MediaItem {
  const { song } = resource;
  const url = normalizeMediaUrl(resource.streamUrl);
  return {
    mediaId: song.localId,
    title: song.title,
    artist: song.artist.name,
    albumTitle: song.album.title || undefined,
    duration: song.durationSeconds || undefined,
    url: url.startsWith('file://') ? { uri: url } : url,
    artworkUrl: buildCover(song.cover, 'grid') ?? undefined,
    ...(extra?.headers ? { headers: extra.headers } : {}),
    ...(extra?.artworkHeaders ? { artworkHeaders: extra.artworkHeaders } : {}),
  };
}
