import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';
import { makeLocalId, parseLocalId } from '@/domain/identity/LocalId';
import type { LocalId } from '@/domain/identity/LocalId';
import type { BookmarkSnapshot } from '@/utils/redux/slices/playbackSlice';
import { isPodcastEpisode, PODCAST_EPISODE_ID_PREFIX } from './contentKind';

/**
 * Whether a resume position needs a stored snapshot to be renderable later.
 *
 * A library track does not: "Continue Playing" joins it against the synced
 * library by id, which stays authoritative for re-tagging and artwork. A
 * podcast episode is never in that library — `buildPodcastSong` namespaces its
 * id with `podcast:` exactly so it cannot collide with a real track — so a
 * bookmark with no snapshot is one nothing can draw.
 *
 * Keyed off the id namespace rather than `contentKind` alone, because the
 * namespace is what actually decides whether the library join can succeed, and
 * a Song rebuilt from a snapshot may arrive without its kind.
 */
export function needsSnapshot(song: Song): boolean {
  return isPodcastEpisode(song) || song.nativeId.startsWith(PODCAST_EPISODE_ID_PREFIX);
}

/**
 * The credential-free part of a Song, for persisting beside a resume position.
 *
 * `streamUrl` is deliberately dropped. `buildStreamUrl` signs it with the
 * user's token, and this ends up in a slice that is written to disk — storing
 * it would put credentials in app storage and freeze them at whatever they
 * were when the bookmark was written. The id is kept instead and the URL is
 * rebuilt at play time.
 */
export function toBookmarkSnapshot(song: Song): BookmarkSnapshot {
  return {
    title: song.title,
    artist: song.artist.name,
    cover: song.cover,
    duration: String(song.durationSeconds),
    contentKind: song.contentKind,
    streamId: song.streamId,
    channelId: song.album.nativeId || undefined,
  };
}

/**
 * Rebuild something playable from a stored snapshot.
 *
 * A resource rather than a bare song, because a snapshot on its own is not
 * playable — the URL is supplied by the caller, since building one needs an
 * api client bound to the active server and this stays pure so it can be
 * tested without one.
 *
 * Provenance is read back out of the bookmark's own key. That is the whole
 * reason identity is a readable, parseable string: a snapshot written weeks
 * ago can be turned back into a record that knows which server it came from,
 * without consulting any store. Null when the key is not a song identity,
 * which means the snapshot cannot describe a track at all.
 */
export function resourceFromBookmarkSnapshot(
  bookmarkId: LocalId,
  snapshot: BookmarkSnapshot,
  streamUrl: string,
): PlayableResource | null {
  const parsed = parseLocalId(bookmarkId);
  if (!parsed || parsed.kind !== 'song') return null;
  const { provenance, nativeId } = parsed;

  return {
    song: {
      localId: bookmarkId,
      nativeId,
      provenance,
      externalIds: {},
      // A bookmark only exists for something the user was playing, so it is
      // theirs in whatever sense it was when the position was stored.
      libraryState: 'in-library',
      title: snapshot.title,
      artist: {
        localId: makeLocalId('artist', provenance, ''),
        nativeId: '',
        externalIds: {},
        name: snapshot.artist,
        cover: { kind: 'none' },
      },
      album: {
        localId: makeLocalId('album', provenance, snapshot.channelId ?? ''),
        nativeId: snapshot.channelId ?? '',
        externalIds: {},
        // A podcast episode's "album" is its channel, which is what the
        // snapshot stored the artist name for.
        title: snapshot.artist,
        cover: snapshot.cover ?? { kind: 'none' },
      },
      cover: snapshot.cover ?? { kind: 'none' },
      durationSeconds: Number(snapshot.duration ?? 0) || 0,
      contentKind: snapshot.contentKind ?? 'song',
      streamId: snapshot.streamId,
      genres: [],
    },
    streamUrl,
  };
}
