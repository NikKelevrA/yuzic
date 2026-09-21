/**
 * A song together with everything needed to actually play it right now.
 *
 * The old model put `streamUrl` on the entity, which made every `Song` claim
 * to be playable and none of them reliably so: a credentialled URL goes stale
 * with the session, is unsafe to persist, and cannot be rebuilt from a record
 * that has already thrown away which server issued it. Splitting the two means
 * an entity describes a work, and a resource describes one attempt to play it.
 *
 * A resource is built at the moment of playing and is never stored. What gets
 * persisted is the song — from which a fresh resource can always be built,
 * because the song still knows its own provenance.
 */
import type { Song } from '@/domain/entities/Song';
import { makeLocalId, parseLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';

export interface PlayableResource {
  song: Song;
  /** Where the player should fetch the audio from, valid for this session. */
  streamUrl: string;
  /** Set when the media is a downloaded local copy rather than a stream. */
  filePath?: string;
  /** Auth headers the player must send with both audio and artwork requests. */
  headers?: Record<string, string>;
}

/**
 * Whether the player can actually open this.
 *
 * A remote URL, a file URL, or a bare absolute path. Anything else — an empty
 * string, a relative path, a scheme the native player cannot open — fails
 * inside the player, at the moment the user pressed play and with nothing on
 * screen explaining why.
 */
export function isPlayable(resource: PlayableResource): boolean {
  const url = resource.streamUrl?.trim();
  if (!url) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('file://') ||
    url.startsWith('/')
  );
}

/** Coarse origin of the media, used for error reporting and recovery. */
export function sourceKind(resource: PlayableResource | null): 'none' | 'file' | 'remote' | 'unknown' {
  if (!resource?.streamUrl) return 'none';
  if (resource.filePath || resource.streamUrl.startsWith('file:')) return 'file';
  if (resource.streamUrl.startsWith('http://') || resource.streamUrl.startsWith('https://')) {
    return 'remote';
  }
  return 'unknown';
}

/**
 * Fails loudly for an explicit play request, where silently dropping the track
 * would look like the button did nothing.
 */
export function assertPlayable(resources: PlayableResource[]): void {
  const invalid = resources.find(resource => !isPlayable(resource));
  if (invalid) {
    throw new Error(`Track has no playable media URL: ${invalid.song.localId}`);
  }
}

/** Drops unplayable tracks, for queue fills where the rest should still play. */
export const playableOnly = (resources: PlayableResource[]): PlayableResource[] =>
  resources.filter(isPlayable);

/** Whether two queues hold the same tracks in the same order. */
export const sameQueue = (current: PlayableResource[], next: PlayableResource[]): boolean =>
  current.length === next.length &&
  current.every((resource, index) => resource.song.localId === next[index]?.song.localId);

/**
 * Rebuilds a resource from what the native player reports, for when its queue
 * holds a track the app's own queue has lost track of.
 *
 * This is why identity is a readable, parseable string rather than a hash: the
 * media id the player echoes back is the song's `localId`, so provenance and
 * the origin's own id can be recovered from it without consulting any store.
 * Null when the item lacks the identity or URL that makes it playable at all.
 */
export function resourceFromPlayerItem(item: {
  mediaId?: string;
  url?: string;
  title?: string;
  artist?: string;
  duration?: number;
}): PlayableResource | null {
  const mediaId = item.mediaId?.trim();
  const streamUrl = item.url?.trim();
  if (!mediaId || !streamUrl) return null;

  const parsed = parseLocalId(mediaId);
  if (!parsed || parsed.kind !== 'song') return null;
  const { provenance, nativeId } = parsed;

  const emptyRef = (kind: 'artist' | 'album', name: string) => ({
    localId: makeLocalId(kind, provenance, ''),
    nativeId: '',
    externalIds: {},
    cover: { kind: 'none' as const },
    ...(kind === 'artist' ? { name } : { title: name }),
  });

  return {
    song: {
      localId: mediaId as LocalId,
      nativeId,
      provenance,
      externalIds: {},
      // The player is reporting something it is already holding, so the app
      // owns it in whatever sense it owned it when it was queued.
      title: item.title ?? '',
      artist: emptyRef('artist', item.artist ?? '') as Song['artist'],
      album: emptyRef('album', '') as Song['album'],
      cover: { kind: 'none' },
      durationSeconds: item.duration ?? 0,
      // Recovered from the player's own queue, so it is whatever the player
      // was told to treat it as; a recovered track is never re-scrobbled.
      contentKind: 'song',
      genres: [],
    },
    streamUrl,
  };
}
