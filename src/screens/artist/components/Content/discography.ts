import type { Album } from '@/domain/entities/Album';
import type { ExternalAlbumBase } from '@/types';

// Local albums carry a numeric `year`; external ones carry an ISO-ish
// `releaseDate` (Deezer, MusicBrainz) with the bare year in `subtext` as a
// fallback. Either can be absent or zero when the upstream has no date.
export function releaseYearOf(album: Album | ExternalAlbumBase): number | null {
  // `provenance` is the discriminant: it's the only field here guaranteed to
  // exist on every domain `Album` and never on an `ExternalAlbumBase` — both
  // `year` and `releaseType` are optional on one side or the other, so TS
  // can't narrow on either of those alone.
  if ('provenance' in album) return album.year && album.year > 0 ? album.year : null;
  const raw = album.releaseDate ?? album.subtext;
  const year = parseInt(String(raw).slice(0, 4), 10);
  return Number.isFinite(year) && year > 0 ? year : null;
}

// Row subtext for the merged discography: the release year, since that's the
// sort key and every row already belongs to the same artist. Null when the
// year is unknown so callers can fall back to the album's own subtext.
export function releaseYearLabel(album: Album | ExternalAlbumBase): string | null {
  const year = releaseYearOf(album);
  return year === null ? null : String(year);
}

// Newest first, unknown years sink to the end. Ties keep insertion order
// (Array.prototype.sort is stable), so owned releases stay ahead of external
// ones from the same year.
export function compareByReleaseYearDesc(
  a: Album | ExternalAlbumBase,
  b: Album | ExternalAlbumBase
): number {
  const ya = releaseYearOf(a);
  const yb = releaseYearOf(b);
  if (ya === null && yb === null) return 0;
  if (ya === null) return 1;
  if (yb === null) return -1;
  return yb - ya;
}
