/**
 * Turning a MusicBrainz artist's release-group list into a discography a
 * person would recognise as theirs.
 *
 * MusicBrainz files every edition of a record as its own release group
 * ("Evolution", "Evolution (Deluxe Edition)", a second "Evolution" that only
 * differs by a data quirk), and files live albums, compilations and bootlegs
 * next to studio albums with only a secondary type to tell them apart. Shown
 * as they come, "47 albums" means 47 entries, not 47 albums. Everything here
 * is pure, so the rules can be read and tested apart from any fetching.
 */
import type { MbReleaseGroup } from './';

/**
 * A parenthetical or bracketed suffix that only names an edition, not a
 * different record: "(Deluxe Edition)", "(25th Anniversary)", "[Remastered]".
 * Anything else in brackets is part of the title and stays.
 */
const EDITION_SUFFIX =
  /\s*[([][^)\]]*\b(deluxe|edition|anniversary|remaster(?:ed)?|expanded|bonus|special|explicit|clean|reissue|collector'?s?|version)\b[^)\]]*[)\]]\s*$/i;

/** The title with edition suffixes removed, lower-cased for comparing. */
export function baseTitle(title: string): string {
  let t = title.trim();
  for (;;) {
    const next = t.replace(EDITION_SUFFIX, '');
    if (next === t) break;
    t = next;
  }
  return t.trim().toLowerCase();
}

/** A studio album: an Album (or untyped) release group with no secondary type. */
export function isStudioAlbum(rg: MbReleaseGroup): boolean {
  const primary = rg['primary-type'];
  return (!primary || primary === 'Album') && !(rg['secondary-types']?.length);
}

/** Anything an artist's page lists: an album of any kind, a single or an EP. */
export function isArtistRelease(rg: MbReleaseGroup): boolean {
  const primary = rg['primary-type'];
  return !primary || primary === 'Album' || primary === 'Single' || primary === 'EP';
}

/** Earliest date wins; on a tie the shorter (plainer) title does. */
function isBetterRepresentative(a: MbReleaseGroup, b: MbReleaseGroup): boolean {
  const da = a['first-release-date'] || '9999';
  const db = b['first-release-date'] || '9999';
  if (da !== db) return da < db;
  return a.title.length < b.title.length;
}

/**
 * One release group per record: entries whose base titles match collapse into
 * the earliest, plainest one. The order the survivors first appeared in is
 * kept, so a caller's own sorting still applies.
 */
export function collapseEditions(rgs: readonly MbReleaseGroup[]): MbReleaseGroup[] {
  const chosen = new Map<string, MbReleaseGroup>();
  for (const rg of rgs) {
    // A single and the album it came from share a title and are still two
    // records, so the kind of release is part of what makes two entries one.
    const key = [
      baseTitle(rg.title ?? ''),
      rg['primary-type'] ?? '',
      [...(rg['secondary-types'] ?? [])].sort().join('+'),
    ].join('|');
    const current = chosen.get(key);
    if (!current || isBetterRepresentative(rg, current)) chosen.set(key, rg);
  }
  const survivors = new Set(chosen.values());
  return rgs.filter(rg => survivors.has(rg));
}

/**
 * What a record is called with every trailing qualifier removed: a bracketed
 * one ("(Live in London)", "[Acoustic]") or a dash one ("- Live at Red
 * Rocks"). Two release groups of one artist that share this are versions of
 * the same record, which is what a record's page lists as "other versions".
 */
export function familyTitle(title: string): string {
  let t = title.trim();
  for (;;) {
    const next = t
      .replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
      .replace(/\s+-\s+[^-]*$/, '');
    if (next === t || next === '') break;
    t = next.trim();
  }
  return t.toLowerCase();
}

/**
 * The other release groups that are versions of `current`: deluxe and
 * anniversary editions, live and acoustic takes, reissues. Oldest first, so
 * the original record leads.
 */
export function versionsOf(
  rgs: readonly MbReleaseGroup[],
  current: { id: string; title: string }
): MbReleaseGroup[] {
  const family = familyTitle(current.title);
  if (!family) return [];
  return rgs
    .filter(rg => rg.id !== current.id && familyTitle(rg.title ?? '') === family)
    .sort((a, b) => (a['first-release-date'] || '9999').localeCompare(b['first-release-date'] || '9999'));
}
