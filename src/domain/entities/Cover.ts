import type { ExternalIds } from '../identity/ExternalIds';
import { normalizeName } from '../identity/matching';

/**
 * Who an image is of, for a cover its source could not supply.
 *
 * A source with no picture for an item still knows which item it is, and that
 * is all a backup needs to look one up — the library's own copy of the same
 * artist, or an outside archive. Carried on the cover rather than beside it so
 * every surface that draws a cover (a tile, the player, CarPlay) can have the
 * gap filled without being handed the whole entity.
 */
export type CoverSubject =
  | { kind: 'artist'; name: string; mbid?: string }
  | {
      kind: 'album';
      title: string;
      artistName: string;
      mbid?: string;
      mbidType?: 'release' | 'release-group';
    };

export type CoverSource =
  | { kind: 'special'; name: 'heart' }
  | { kind: 'none'; subject?: CoverSubject }
  | { kind: 'navidrome'; coverArtId: string }
  | { kind: 'jellyfin'; itemId: string; }
  | { kind: 'emby'; itemId: string; tag?: string }
  | { kind: 'plex'; path: string }
  | { kind: 'url'; url: string }
  | { kind: 'musicbrainz'; releaseGroupId: string }
  | { kind: 'coverartarchive'; mbid: string; mbidType: 'release' | 'release-group' | 'unknown' }
  | { kind: 'commons'; filename: string }

/**
 * Whether a cover source will actually resolve to an image.
 *
 * `{ kind: 'none' }` is a value, not an absence, so `cover ?? fallback` never
 * falls through it — a caller chaining fallbacks has to ask. Getting this
 * wrong renders a broken image instead of the fallback that was written.
 */
export const hasCoverImage = (cover: CoverSource | null | undefined): boolean =>
  Boolean(cover) && cover!.kind !== 'none';

/** The first cover in preference order that will actually resolve. */
export const firstResolvableCover = (
  ...covers: (CoverSource | null | undefined)[]
): CoverSource | null => covers.find(hasCoverImage) ?? null;

export const COVER_PX: Record<'thumb' | 'grid' | 'detail' | 'background', number> = {
  thumb: 96,
  grid: 420,
  detail: 1200,
  background: 1800,
};

/** The subject of an artist's picture, or none for a name that identifies nobody. */
export function artistCoverSubject(
  name: string | undefined,
  externalIds: ExternalIds = {}
): CoverSubject | undefined {
  if (!name?.trim()) return undefined;
  return externalIds.mbid ? { kind: 'artist', name, mbid: externalIds.mbid } : { kind: 'artist', name };
}

/** The subject of an album's cover. Both a title and an artist are needed to name one. */
export function albumCoverSubject(
  title: string | undefined,
  artistName: string | undefined,
  externalIds: ExternalIds = {}
): CoverSubject | undefined {
  if (!title?.trim() || !artistName?.trim()) return undefined;
  return {
    kind: 'album',
    title,
    artistName,
    ...(externalIds.mbid ? { mbid: externalIds.mbid } : {}),
    ...(externalIds.mbid && externalIds.mbidType ? { mbidType: externalIds.mbidType } : {}),
  };
}

/**
 * A source's own cover, or — where it has none — a gap naming who it is of.
 *
 * Mappers call this instead of writing `{ kind: 'none' }`, so the one place a
 * protocol says "no image" is also where the item is named for a backup.
 */
export function coverOrMissing(cover: CoverSource, subject: CoverSubject | undefined): CoverSource {
  if (cover.kind !== 'none') return cover;
  return subject ? { kind: 'none', subject } : { kind: 'none' };
}

/** A gap naming who it is of, or a plain gap when nothing names anyone. */
export const missingCover = (subject: CoverSubject | undefined): CoverSource =>
  coverOrMissing({ kind: 'none' }, subject);

/**
 * One stable key per subject, for remembering what a backup found.
 *
 * An MBID identifies the item across every name it has been spelled by, so it
 * is the key when there is one; otherwise the normalised name, which is also
 * what a name lookup is keyed on.
 */
export function coverSubjectKey(subject: CoverSubject): string {
  if (subject.kind === 'artist') {
    return subject.mbid ? `artist:mbid:${subject.mbid}` : `artist:name:${normalizeName(subject.name)}`;
  }
  return subject.mbid
    ? `album:mbid:${subject.mbid}`
    : `album:name:${normalizeName(subject.artistName)}:${normalizeName(subject.title)}`;
}
