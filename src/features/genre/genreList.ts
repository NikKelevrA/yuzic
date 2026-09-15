import type { Album } from '@/domain/entities/Album';

/**
 * Builds the browsable genre list.
 *
 * The server reports its own genre list, but the genre screen selects albums
 * with `album.genres.includes(genre)` — an exact string match. A genre the
 * server knows about that no album's tags match would open an empty screen, so
 * the count is computed with the same rule and empty genres are left out.
 */

export type GenreRow = {
  genre: string;
  albumCount: number;
};

/**
 * The genres a library has: the server's own list when it reports one,
 * otherwise every genre its albums are tagged with.
 */
export function libraryGenres(
  serverGenres: string[],
  albums: Pick<Album, 'genres'>[]
): string[] {
  if (serverGenres.length > 0) return serverGenres;
  const tagged = new Set<string>();
  for (const album of albums) {
    for (const genre of album.genres ?? []) tagged.add(genre);
  }
  return [...tagged].sort((a, b) => a.localeCompare(b));
}

export function buildGenreRows(
  genres: string[],
  albums: Pick<Album, 'genres'>[]
): GenreRow[] {
  const counts = new Map<string, number>();
  for (const album of albums) {
    for (const genre of album.genres ?? []) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const rows: GenreRow[] = [];
  for (const genre of genres) {
    if (seen.has(genre)) continue;
    seen.add(genre);
    const albumCount = counts.get(genre) ?? 0;
    if (albumCount > 0) rows.push({ genre, albumCount });
  }

  // Alphabetical: a browse list is scanned for a name, not ranked by size.
  return rows.sort((a, b) => a.genre.localeCompare(b.genre));
}
