/**
 * Deezer track DTOs -> domain Song.
 *
 * Two distinct DTOs map here, and they produce two different `contentKind`s:
 *
 * - `DeezerTrack` (catalog.ts) is the general catalogue record behind
 *   artist-top-tracks and album-track listings: full metadata (duration,
 *   ISRC, embedded artist/album) describing the real song, the same as a
 *   Navidrome song describes a real file. It maps to `'song'`.
 * - `DeezerPreviewTrack` (albums/index.ts) is minted specifically to let a
 *   library album with no local copy play a 30-second snippet. It carries no
 *   ISRC and no independent artist/album — it exists only to be that clip.
 *   It maps to `'preview'`.
 *
 * Both map to `'preview'`, because Deezer's public API never hands this app a
 * full-length stream: a thirty-second clip is the only audio it returns. A
 * catalogue record that the player accepted as a `'song'` would be scrobbled
 * as a listen, seeded into autoplay, and retried on failure as though its URL
 * could be reissued — none of which is true of it.
 *
 * The clip's URL is carried on `streamId` rather than being rebuilt later.
 * A sample is not `hasReissuableUrl`: Deezer issues the link once and no id
 * can be turned back into it, so losing it here means the preview button
 * silently stops working. That is the one case where the URL travels with the
 * entity, and it is safe to because it carries no credentials of ours.
 */
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { CoverSource } from '@/types/Cover';
import { albumRef, artistRef } from './mapRefs';
import type { DeezerAlbum, DeezerTrack, DeezerPreviewTrack } from './types';

function albumCover(album: DeezerAlbum): CoverSource {
  const url = album.cover_xl ?? album.cover_big ?? album.cover_medium;
  return url ? { kind: 'url', url } : { kind: 'none' };
}

function externalIdsOf(dto: DeezerTrack): ExternalIds {
  const ids: ExternalIds = {};
  if (dto.id != null) ids.deezerId = String(dto.id);
  if (dto.isrc) ids.isrc = dto.isrc;
  return ids;
}

export interface MapSongContext {
  provenance: Provenance;
  /**
   * The album this track belongs to. Every call site that produces a
   * `DeezerTrack` (artist top tracks, album track listings) already has the
   * parent album in hand, so it is required here rather than optional —
   * unlike Navidrome, Deezer tracks never carry a standalone album title
   * with no object behind it.
   */
  album: DeezerAlbum;
}

export function mapSong(dto: DeezerTrack, context: MapSongContext): Song {
  const { provenance, album } = context;
  const nativeId = dto.id != null ? String(dto.id) : '';

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: externalIdsOf(dto),
    libraryState: 'external',
    title: dto.title ?? 'Unknown',
    artist: artistRef(provenance, dto.artist ?? album.artist),
    album: albumRef(provenance, album),
    cover: albumCover(album),
    durationSeconds: dto.duration ?? 0,
    // Every Deezer track is a preview, including this full catalogue record.
    // Deezer's public API never yields full audio — the only stream it offers
    // is a 30-second clip — so a Deezer-sourced track that the player accepted
    // as a 'song' would be scrobbled as a listen, seeded into autoplay, and
    // retried on failure as though its URL could be reissued. None of those
    // are true of it. `durationSeconds` stays the real catalogue duration,
    // because that is what the record says the work is; what is playable is a
    // separate question, and this field answers it.
    contentKind: 'preview',
    // The clip Deezer will actually play, where it offered one.
    streamId: dto.preview ?? undefined,
    genres: [],
  };
}

export interface MapPreviewTrackContext {
  provenance: Provenance;
  /** The album this preview clip was resolved for. */
  album: DeezerAlbum;
}

export function mapPreviewTrack(dto: DeezerPreviewTrack, context: MapPreviewTrackContext): Song {
  const { provenance, album } = context;
  const nativeId = dto.id != null ? String(dto.id) : '';

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: nativeId ? { deezerId: nativeId } : {},
    libraryState: 'external',
    title: dto.title ?? 'Unknown',
    artist: artistRef(provenance, album.artist),
    album: albumRef(provenance, album),
    cover: albumCover(album),
    durationSeconds: dto.duration ?? 0,
    // A bare 30-second clip — see module comment.
    contentKind: 'preview',
    streamId: dto.preview,
    trackNumber: dto.track_position,
    genres: [],
  };
}
