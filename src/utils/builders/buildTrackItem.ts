import type { MediaItem } from '../../features/player/mediaItem';
import type { RequestHeaders } from '../../features/player/mediaHeaders';
import type { PlayableResource } from '@/features/playback/playableResource';
import { buildCover } from './buildCover';

export function normalizeMediaUrl(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (url.startsWith('/')) return `file://${url}`;
  return url;
}

/**
 * `extra` carries the ephemeral request headers a protected server needs — a
 * Plex behind a Basic-auth proxy — resolved by the caller against the active
 * server (see `mediaHeadersForSong`). Kept a parameter rather than read from
 * the store here so the builder stays pure and every playback consumer routes
 * headers through the same resolution point. Fields are set only when present,
 * so an unprotected server produces exactly the item it did before.
 */
export function buildTrackItem(resource: PlayableResource, extra?: RequestHeaders): MediaItem {
  const { song } = resource;
  const url = normalizeMediaUrl(resource.streamUrl);
  return {
    // Identity, not the origin's id: this is what the native player echoes
    // back, and `resourceFromPlayerItem` parses it to rebuild a track the app
    // has lost sight of.
    mediaId: song.localId,
    title: song.title,
    artist: song.artist.name,
    albumTitle: song.album.title,
    duration: song.durationSeconds || undefined,
    url: url.startsWith('file://') ? { uri: url } : url,
    artworkUrl: buildCover(song.cover, 'grid') ?? undefined,
    ...(extra?.headers ? { headers: extra.headers } : {}),
    ...(extra?.artworkHeaders ? { artworkHeaders: extra.artworkHeaders } : {}),
  };
}
