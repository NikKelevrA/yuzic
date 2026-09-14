import type { Album } from '@/domain/entities/Album';
import type { LocalId } from '@/domain/identity/LocalId';
import type { CoverSource } from '@/domain/entities/Cover';

type LocalArtistSummary = {
  /** On-device identity — used for React keys and dedup against other shelves. */
  localId: LocalId;
  /** The artist's id at the origin — used to navigate to the artist screen. */
  nativeId: string;
  name: string;
  cover: CoverSource;
};

// A cheap, always-available approximation of "similar artists" — other
// library artists sharing genre tags with this one. Materially weaker than a
// real similarity graph (Deezer/Last.fm), which is why it's labeled and
// rendered as its own sub-group rather than merged into their results.
export function findArtistsWithSharedGenres(
  targetArtistLocalId: LocalId,
  albums: Album[],
  limit = 8
): LocalArtistSummary[] {
  const genresByArtist = new Map<LocalId, Set<string>>();
  const artistMeta = new Map<LocalId, LocalArtistSummary>();

  for (const album of albums) {
    const artistLocalId = album.artist.localId;
    if (!artistMeta.has(artistLocalId)) {
      artistMeta.set(artistLocalId, {
        localId: artistLocalId,
        nativeId: album.artist.nativeId,
        name: album.artist.name,
        cover: album.artist.cover,
      });
    }
    const genres = genresByArtist.get(artistLocalId) ?? new Set<string>();
    album.genres.forEach(g => genres.add(g));
    genresByArtist.set(artistLocalId, genres);
  }

  const targetGenres = genresByArtist.get(targetArtistLocalId);
  if (!targetGenres || targetGenres.size === 0) return [];

  return [...artistMeta.keys()]
    .filter(localId => localId !== targetArtistLocalId)
    .map(localId => {
      const genres = genresByArtist.get(localId) ?? new Set<string>();
      let overlap = 0;
      for (const g of genres) if (targetGenres.has(g)) overlap++;
      return { localId, overlap };
    })
    .filter(candidate => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map(candidate => artistMeta.get(candidate.localId)!);
}

/**
 * Drops server-similar entries that the local-similar shelf already covers.
 *
 * Both usually surface the same shared-genre neighbours, and showing two
 * identical rows for the same artist is worse than showing one — the
 * server-native shelf loses the tie since local-similar is the cheaper,
 * always-available signal.
 */
export function dedupeServerSimilar<T extends { localId: LocalId }>(
  serverSimilar: readonly T[],
  localSimilar: readonly { localId: LocalId }[]
): T[] {
  const localIds = new Set(localSimilar.map(a => a.localId));
  return serverSimilar.filter(a => !localIds.has(a.localId));
}
