/**
 * The outside sources that can supply a picture an item's own source did not
 * have, declared here with the other provider declarations so the cover
 * resolution in `features/artwork` asks for "a backup" and never names one.
 *
 * Which of these run, and in what order, is the user's Metadata › Artwork
 * list (`sources.ts`, purpose `artwork`): Cover Art Archive first, because it
 * matches an album by MusicBrainz id, then Deezer, which matches by name.
 */
import * as deezer from '@/providers/integration/deezer';
import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import type { CoverSource, CoverSubject } from '@/domain/entities/Cover';
import { normalizeName } from '@/domain/identity/matching';
import type { SourceId } from './sources';

interface CoverBackup {
  source: SourceId;
  /** Whether this source can answer for this kind of subject at all. */
  handles(subject: CoverSubject): boolean;
  /**
   * The picture this source has for the subject, or `null` when it has none —
   * a definite answer, remembered as one. Throws when the source could not be
   * asked, which is not an answer and is not remembered.
   */
  lookup(subject: CoverSubject): Promise<CoverSource | null>;
}

const COVER_ART_ARCHIVE = 'https://coverartarchive.org';

/**
 * Cover Art Archive by MusicBrainz id: an exact match, never a guess.
 *
 * Servers do not always say whether an album id is a release or a release
 * group, and one said the wrong one before, so the stated kind is asked first
 * and the other second. The listing is asked rather than the image, so an
 * album the archive has no front for is a definite "none" instead of a
 * broken image.
 */
const coverArtArchive: CoverBackup = {
  source: 'coverartarchive',
  handles: subject => subject.kind === 'album' && Boolean(subject.mbid),
  async lookup(subject) {
    if (subject.kind !== 'album' || !subject.mbid) return null;
    const kinds = subject.mbidType === 'release'
      ? (['release', 'release-group'] as const)
      : (['release-group', 'release'] as const);

    for (const mbidType of kinds) {
      const res = await fetchWithTimeout(`${COVER_ART_ARCHIVE}/${mbidType}/${encodeURIComponent(subject.mbid)}`, {
        headers: { Accept: 'application/json' },
      });
      // 404: nothing under this id. 400: not a valid id of this kind.
      if (res.status === 404 || res.status === 400) continue;
      if (!res.ok) throw new Error(`Cover Art Archive error (${res.status})`);
      const listing = (await res.json()) as { images?: { front?: boolean }[] };
      if (listing.images?.some(image => image.front)) {
        return { kind: 'coverartarchive', mbid: subject.mbid, mbidType };
      }
    }
    return null;
  },
};

/**
 * Deezer by name. A name search always finds somebody, so the result is used
 * only when it is the same name — a placeholder is better than a stranger's
 * photo.
 */
const deezerCatalogue: CoverBackup = {
  source: 'deezer',
  handles: () => true,
  async lookup(subject) {
    if (subject.kind === 'artist') {
      const match = await deezer.resolveDeezerArtistByName(subject.name);
      if (!match || normalizeName(match.name) !== normalizeName(subject.name)) return null;
      return match.cover.kind === 'none' ? null : match.cover;
    }
    const match = await deezer.resolveDeezerAlbum(subject.artistName, subject.title);
    if (!match) return null;
    const sameAlbum =
      normalizeName(match.title) === normalizeName(subject.title) &&
      normalizeName(match.artist.name) === normalizeName(subject.artistName);
    return sameAlbum && match.cover.kind !== 'none' ? match.cover : null;
  },
};

const BACKUPS: Partial<Record<SourceId, CoverBackup>> = {
  coverartarchive: coverArtArchive,
  deezer: deezerCatalogue,
};

/** The backup an artwork source provides, or null for a source that is not one. */
export function coverBackupFor(source: SourceId): CoverBackup | null {
  return BACKUPS[source] ?? null;
}
