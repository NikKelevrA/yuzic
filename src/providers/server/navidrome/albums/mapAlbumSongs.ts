/**
 * Maps an album's embedded song list through the one true song mapper.
 *
 * Subsonic's album payload doesn't repeat the album's own cover or title on
 * every track, so those are threaded through as fallbacks the same way
 * mapSong already supports for a bare song lookup — this file used to
 * duplicate that fallback logic inline; now it just supplies the context.
 */
import type { Song } from '@/domain/entities/Song';
import type { Provenance } from '@/domain/identity/Provenance';
import type { CoverSource } from '@/domain/entities/Cover';
import { mapSong } from '../mapSong';
import type { SubsonicAlbum } from '../types';

export function mapAlbumSongs(album: SubsonicAlbum, cover: CoverSource, provenance: Provenance): Song[] {
  return (album.song ?? [])
    .filter((song): song is typeof song & { id: string } => !!song?.id)
    .map((song) =>
      mapSong(song, {
        provenance,
        cover,
        albumTitle: album.name,
        albumId: album.id,
      })
    );
}
