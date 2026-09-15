/**
 * The artist and album references embedded in Deezer track and album payloads.
 *
 * Unlike Subsonic, Deezer never returns a neighbour as a bare id — a track
 * embeds its whole `artist` and `album` objects, and an album embeds its
 * whole `artist`. So these build the reference form straight from that nested
 * DTO shape, rather than from loose id/name/cover parameters the way the
 * Navidrome reference's `artistRef`/`albumRef` do.
 */
import type { AlbumRef, ArtistRef } from '@/domain/entities/EntityRef';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';
import { albumCoverSubject, artistCoverSubject, missingCover, type CoverSource } from '@/domain/entities/Cover';
import { imageCover } from './imageCover';
import type { DeezerAlbum, DeezerArtist } from './types';

/** Deezer's largest-first artist picture, or a gap naming the artist. */
function artistCover(artist: DeezerArtist): CoverSource {
  return imageCover([artist.picture_xl, artist.picture_big, artist.picture_medium], artistCoverSubject(artist.name));
}

/** Deezer's largest-first album cover, or a gap naming the album. */
export function albumCover(album: DeezerAlbum): CoverSource {
  return imageCover(
    [album.cover_xl, album.cover_big, album.cover_medium],
    albumCoverSubject(album.title, album.artist?.name)
  );
}

export function artistRef(provenance: Provenance, artist: DeezerArtist | undefined): ArtistRef {
  const nativeId = artist?.id != null ? String(artist.id) : '';
  return {
    localId: makeLocalId('artist', provenance, nativeId),
    nativeId,
    externalIds: nativeId ? { deezerId: nativeId } : {},
    name: artist?.name ?? 'Unknown Artist',
    cover: artist ? artistCover(artist) : missingCover(undefined),
  };
}

export function albumRef(provenance: Provenance, album: DeezerAlbum | undefined): AlbumRef {
  const nativeId = album?.id != null ? String(album.id) : '';
  return {
    localId: makeLocalId('album', provenance, nativeId),
    nativeId,
    externalIds: nativeId ? { deezerId: nativeId } : {},
    title: album?.title ?? 'Unknown Album',
    cover: album ? albumCover(album) : missingCover(undefined),
  };
}
