/**
 * Pure recommendation-selection logic for the playlist "Recommended" footer,
 * pulled out of `RecommendedSection` — the file this used to live in had
 * grown to 549 lines by mixing this with the rows/sections that render it.
 * `playlistArtistNames` in particular used to be copy-pasted three times in
 * that file (once per section, once in the combined footer); it is now the
 * one seed-selection rule both recommendation rails build from.
 *
 * Deliberately provider-free: the Deezer/Last.fm discovery call
 * (`fetchExternalRecs`) stays in `DeezerRecommendedSection.tsx` rather than
 * living here, so the two provider names it names stay confined to the one
 * file that already named them — splitting a file must not multiply how many
 * files a provider name leaks into.
 */
import type { Song } from '@/domain/entities/Song';
import seededShuffle from '@/features/playlist/seededShuffle';

export const LOCAL_RECOMMENDED_COUNT = 8;
const MAX_SEED_ARTISTS = 3;

/** Up to `max` distinct artist names from a playlist's own songs, "Various
 *  Artists" excluded — the seed both recommendation rails build from. */
export function playlistArtistNames(songs: readonly Song[], max = MAX_SEED_ARTISTS): string[] {
  const names = new Set<string>();
  for (const song of songs) {
    if (song.artist.name && song.artist.name.toLowerCase() !== 'various artists') {
      names.add(song.artist.name);
    }
  }
  return [...names].slice(0, max);
}

/** Same-artist shuffle from the local library — used whenever AudioMuse-AI
 *  isn't configured, and as a safety net if its similarity call fails. */
export function pickFallbackLocalSongs(
  tracks: readonly Song[],
  playlistSongIds: ReadonlySet<string>,
  artistNames: readonly string[],
  seed: number,
  count: number = LOCAL_RECOMMENDED_COUNT
): Song[] {
  const artistSet = new Set(artistNames.map(n => n.toLowerCase()));
  const pool = tracks.filter(
    s => !playlistSongIds.has(s.localId) && s.artist.name && artistSet.has(s.artist.name.toLowerCase())
  );
  return seededShuffle(pool, seed).slice(0, count);
}
