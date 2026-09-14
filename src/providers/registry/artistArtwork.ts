/**
 * Pictures for artists that arrive without one.
 *
 * Similar-artist lists from listeners and scrobblers name artists and nothing
 * else, so every tile drew the empty placeholder. The artwork enrichment only
 * runs on an artist's own page, one entity at a time, and no list asked it.
 * This fills a whole list where it is built: each artist without a picture is
 * looked up in the catalogue by name, and the catalogue's photo is used when
 * that lookup finds the same artist.
 *
 * Declared with the other provider declarations, so feature code asks for
 * "artist artwork" by this use and never names the catalogue answering.
 */
import * as deezer from '@/providers/integration/deezer';
import type { Artist } from '@/domain/entities/Artist';
import type { SourceUseId } from './sources';

/** The switch that allows looking pictures up — the same one Settings › Metadata shows. */
export const ARTIST_ARTWORK_USE: SourceUseId = 'deezer.artwork';

/**
 * How many lookups go out at once. A list is ten or so names, and sending them
 * all together is the burst the catalogue's rate limit is there to refuse;
 * repeats are answered from its lookup cache.
 */
const LOOKUP_BATCH_SIZE = 4;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The same artists, in the same order, with a picture wherever the catalogue
 * has one for an artist of the same name. An artist that already has a picture
 * is left as it is, and a lookup that fails or finds someone else changes
 * nothing — a placeholder is better than a stranger's photo.
 */
export async function withArtistArtwork(artists: Artist[]): Promise<Artist[]> {
  const filled = [...artists];
  const missing = artists
    .map((artist, index) => ({ artist, index }))
    .filter(({ artist }) => artist.cover.kind === 'none' && artist.name.trim().length > 0);

  for (let i = 0; i < missing.length; i += LOOKUP_BATCH_SIZE) {
    const batch = missing.slice(i, i + LOOKUP_BATCH_SIZE);
    const matches = await Promise.allSettled(batch.map(({ artist }) => deezer.resolveDeezerArtistByName(artist.name)));
    matches.forEach((result, j) => {
      if (result.status !== 'fulfilled' || !result.value) return;
      const { artist, index } = batch[j];
      if (!sameName(result.value.name, artist.name) || result.value.cover.kind === 'none') return;
      filled[index] = { ...artist, cover: result.value.cover };
    });
  }

  return filled;
}
