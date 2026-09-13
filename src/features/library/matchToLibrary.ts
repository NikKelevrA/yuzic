/**
 * Relating a browsed record (an external album/artist, or a saved want) to
 * the user's synced library, via the domain matcher.
 *
 * This replaces `src/hooks/libraryMatch.ts`, which duplicated
 * `src/domain/identity/matching.ts`'s rules (identifier match preferred over
 * name, regardless of candidate order; a conservative name fallback) against
 * the pre-rewrite `Album`/`Artist` shapes. Every call site now has domain
 * `Album`/`Artist` records on both sides, so this is a thin adapter from
 * "the fields a caller has in hand" to `findMatch`'s `Matchable`/`NameKey`
 * shape — no matching rule lives here.
 */
import { findMatch } from '@/domain/identity/matching';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';

interface AlbumMatchSubject {
  externalIds: ExternalIds;
  title: string;
  /** The album's artist name — required, same as the domain matcher's `NameKey.secondary`. */
  artistName: string;
}

/**
 * Finds the library album (if any) that corresponds to `subject`. mbid/isrc/
 * upc/deezerId are checked before falling back to a normalized title+artist
 * pair, same precedence as the domain matcher.
 */
export function matchAlbumToLibrary(subject: AlbumMatchSubject, albums: readonly Album[]): Album | null {
  const match = findMatch(
    { externalIds: subject.externalIds, nameKey: { primary: subject.title, secondary: subject.artistName } },
    albums,
    (album) => ({ primary: album.title, secondary: album.artist.name })
  );
  return match?.candidate ?? null;
}

interface ArtistMatchSubject {
  externalIds: ExternalIds;
  name: string;
}

/**
 * Finds the library artist (if any) that corresponds to `subject`. An artist
 * has nothing to pair a name with, so the fallback matches on normalized name
 * alone — same as the domain matcher's handling of an absent `secondary`.
 */
export function matchArtistToLibrary(subject: ArtistMatchSubject, artists: readonly Artist[]): Artist | null {
  const match = findMatch(
    { externalIds: subject.externalIds, nameKey: { primary: subject.name } },
    artists,
    (artist) => ({ primary: artist.name })
  );
  return match?.candidate ?? null;
}
