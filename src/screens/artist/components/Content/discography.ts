import type { Album } from '@/domain/entities/Album';

// Every `Album` carries both `year` and `releaseDate` as optional fields now
// — whether it's local or external is `provenance`/`libraryState` data, not a
// different shape. A local record usually has only `year`; an external one
// (Deezer, MusicBrainz) usually reports `releaseDate` and no bare year, so
// this tries both rather than picking one per origin.
export function releaseYearOf(album: Album): number | null {
  if (album.year && album.year > 0) return album.year;
  const year = parseInt(String(album.releaseDate ?? '').slice(0, 4), 10);
  return Number.isFinite(year) && year > 0 ? year : null;
}

// Row subtext for the merged discography: the release year, since that's the
// sort key and every row already belongs to the same artist. Null when the
// year is unknown so callers can fall back to the album's own subtext.
export function releaseYearLabel(album: Album): string | null {
  const year = releaseYearOf(album);
  return year === null ? null : String(year);
}

// Newest first, unknown years sink to the end. Ties keep insertion order
// (Array.prototype.sort is stable), so owned releases stay ahead of external
// ones from the same year.
export function compareByReleaseYearDesc(a: Album, b: Album): number {
  const ya = releaseYearOf(a);
  const yb = releaseYearOf(b);
  if (ya === null && yb === null) return 0;
  if (ya === null) return 1;
  if (yb === null) return -1;
  return yb - ya;
}
