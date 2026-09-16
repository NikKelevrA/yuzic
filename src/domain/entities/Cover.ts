import type { ExternalIds } from '../identity/ExternalIds';
import { leadArtistName, normalizeName } from '../identity/matching';

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
  /**
   * A radio station. Named by its stream URL first and its name second,
   * which is the order a station directory can actually match on: the URL is
   * exact, the name is what people spell differently.
   *
   * A station has no release behind it, so no album or artist subject
   * describes one — but it does have a logo, and that is a picture like any
   * other once something can be asked for it.
   */
  | { kind: 'station'; name: string; streamUrl?: string }
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
  | { kind: 'coverartarchive'; mbid: string; mbidType: 'release' | 'release-group' }

export const COVER_PX: Record<'thumb' | 'grid' | 'detail' | 'background', number> = {
  thumb: 96,
  grid: 420,
  detail: 1200,
  background: 1800,
};

/**
 * The subject of an artist's picture, or none for a name that identifies nobody.
 * A credit line names its lead artist: that is whose picture is looked up.
 */
export function artistCoverSubject(
  name: string | undefined,
  externalIds: ExternalIds = {}
): CoverSubject | undefined {
  if (!name?.trim()) return undefined;
  const lead = leadArtistName(name);
  return externalIds.mbid ? { kind: 'artist', name: lead, mbid: externalIds.mbid } : { kind: 'artist', name: lead };
}

/**
 * The subject of an album's cover. Both a title and an artist are needed to
 * name one; the artist is the credit's lead, which is who the album is filed under.
 */
export function albumCoverSubject(
  title: string | undefined,
  artistName: string | undefined,
  externalIds: ExternalIds = {}
): CoverSubject | undefined {
  if (!title?.trim() || !artistName?.trim()) return undefined;
  return {
    kind: 'album',
    title,
    artistName: leadArtistName(artistName),
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

/**
 * The subject of a radio station's picture, or none for an unnamed station.
 */
export function stationCoverSubject(
  name: string | undefined,
  streamUrl?: string
): CoverSubject | undefined {
  if (!name?.trim()) return undefined;
  return streamUrl?.trim()
    ? { kind: 'station', name: name.trim(), streamUrl: streamUrl.trim() }
    : { kind: 'station', name: name.trim() };
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
  if (subject.kind === 'station') {
    // The stream URL identifies a station across every way its name is
    // punctuated; the name is all there is without one.
    return subject.streamUrl
      ? `station:url:${subject.streamUrl}`
      : `station:name:${normalizeName(subject.name)}`;
  }
  if (subject.kind === 'artist') {
    return subject.mbid ? `artist:mbid:${subject.mbid}` : `artist:name:${normalizeName(subject.name)}`;
  }
  return subject.mbid
    ? `album:mbid:${subject.mbid}`
    : `album:name:${normalizeName(subject.artistName)}:${normalizeName(subject.title)}`;
}
