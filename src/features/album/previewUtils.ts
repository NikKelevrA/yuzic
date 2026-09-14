import { searchAlbumPreviews } from '@/providers/integration/deezer';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';

/**
 * Finds a thirty-second clip for each track of an album the user does not own.
 *
 * Keyed by `nativeId` rather than identity, because the caller looks these up
 * per row from the same album's own track list — one origin, so the origin's
 * own ids are unambiguous and are what the rows already carry.
 *
 * Two sources, in order. A track that already carries a clip on `streamId`
 * needs nothing fetched: a sample's URL is issued once and cannot be rebuilt,
 * which is exactly why it travels with the entity. Otherwise the album is
 * searched for and its tracks matched, by position first and title second —
 * position is reliable within a correctly ordered release, and the title
 * fallback catches a release whose track order differs between catalogues.
 */
export async function fetchPreviewsForExternalAlbum(
  album: Album,
  songs: Song[]
): Promise<Record<string, string>> {
  const embedded: Record<string, string> = {};
  for (const song of songs) {
    if (song.streamId) embedded[song.nativeId] = song.streamId;
  }
  if (Object.keys(embedded).length > 0) return embedded;

  const deezerTracks = await searchAlbumPreviews(album.artist.name, album.title);
  if (!deezerTracks.length) return {};

  const byPosition: Record<number, string> = {};
  const byTitle: Record<string, string> = {};
  for (const track of deezerTracks) {
    if (track.preview) {
      byPosition[track.track_position] = track.preview;
      byTitle[track.title.toLowerCase().trim()] = track.preview;
    }
  }

  const result: Record<string, string> = {};
  songs.forEach((song, index) => {
    const url = byPosition[index + 1] ?? byTitle[song.title.toLowerCase().trim()];
    if (url) result[song.nativeId] = url;
  });
  return result;
}
