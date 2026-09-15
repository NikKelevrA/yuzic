/**
 * Splits an artist's full discography — owned library albums plus whatever
 * an external source knows about — into the four buckets the artist screen
 * renders: owned albums, owned singles/EPs, unowned (missing) albums, and
 * unowned singles/EPs. Each bucket is sorted newest-release-first.
 *
 * Pulled out of `screens/artist/components/Content/index.tsx`'s render so
 * the classification is a pure, independently testable decision rather than
 * something computed inline in a `useMemo` the component owns.
 */
import type { Album } from '@/domain/entities/Album';
import { matchAlbumToLibrary } from '@/features/library/matchToLibrary';
import { compareByReleaseYearDesc } from './discography';
import { isSingleOrEp } from './releaseKind';

export type ClassifiedDiscography = {
  ownedAlbums: Album[];
  ownedSingles: Album[];
  unownedAlbums: Album[];
  unownedSingles: Album[];
};

type ExternalDiscography = {
  albums: readonly Album[];
  singles: readonly Album[];
} | null | undefined;

/**
 * @param localAlbums Every album this artist owns in the library.
 * @param songCountByAlbumId Known track counts, for the singles/EP split —
 * zero (including "unknown") falls back to a title heuristic, see
 * `isSingleOrEp`.
 * @param externalDiscography What an external source reports for this
 * artist by name, if anything — only its entries not already matched to a
 * local album surface as "unowned".
 */
export function classifyDiscography(
  localAlbums: readonly Album[],
  songCountByAlbumId: ReadonlyMap<string, number>,
  externalDiscography: ExternalDiscography
): ClassifiedDiscography {
  const ownedAlbums = localAlbums.filter(
    album => !isSingleOrEp(album, songCountByAlbumId.get(album.localId) ?? 0)
  );
  const ownedSingles = localAlbums.filter(album =>
    isSingleOrEp(album, songCountByAlbumId.get(album.localId) ?? 0)
  );

  // Owned and unowned releases are kept in separate groups rather than
  // merged chronologically — the shared AlbumRow double-checks "already in
  // library" independently as a safety net if this dedup misses an edge
  // case.
  const isMissing = (ext: Album) =>
    !matchAlbumToLibrary(
      { externalIds: ext.externalIds, title: ext.title, artistName: ext.artist.name },
      localAlbums
    );
  const unownedAlbums = (externalDiscography?.albums ?? []).filter(isMissing);
  const unownedSingles = (externalDiscography?.singles ?? []).filter(isMissing);

  return {
    ownedAlbums: [...ownedAlbums].sort(compareByReleaseYearDesc),
    ownedSingles: [...ownedSingles].sort(compareByReleaseYearDesc),
    unownedAlbums: [...unownedAlbums].sort(compareByReleaseYearDesc),
    unownedSingles: [...unownedSingles].sort(compareByReleaseYearDesc),
  };
}
