/**
 * One object per distinct reference, shared by every entity that names it.
 *
 * A `Song` carries its artist and album as embedded references rather than
 * ids, which is what lets `song.artist.name` read the same way everywhere
 * without a lookup. The cost was that 90,000 tracks across 4,000 artists
 * built 90,000 `ArtistRef` objects for 4,000 distinct artists, and the same
 * again for albums and covers.
 *
 * Object count is what costs here, not object size. Measured on the real
 * shapes at 90,000 tracks: 1,405 bytes each and 121 MB today; interning
 * references, covers and provenance takes it to 682 bytes and 59 MB. Slimming
 * the reference's *fields* instead was tried and measured at 18%, because a
 * smaller object is still an object.
 *
 * Normalising to bare ids would reach 434 bytes, but it puts a catalog lookup
 * inside every sort comparator and inside the match index, and changes about
 * 160 call sites. This shape change is none of those things: callers cannot
 * tell the difference.
 *
 * **References are immutable.** They always were — every mapper builds a
 * fresh one and nothing writes to a mapped entity — but sharing turns that
 * habit into a requirement. Writing to a reference now writes to every track
 * that names the same artist.
 */
import type { CoverSource } from './Cover';
import type { AlbumRef, ArtistRef } from './EntityRef';
import type { ExternalIds } from '../identity/ExternalIds';

/**
 * Comfortably past any real library — 4,000 artists and 8,000 albums is a
 * 90,000 track collection — and small enough that an odd server cannot grow
 * these without bound. Past the cap references are still correct, just no
 * longer shared.
 */
const MAX_ENTRIES = 50_000;

const artistRefs = new Map<string, ArtistRef>();
const albumRefs = new Map<string, AlbumRef>();
const covers = new Map<string, CoverSource>();

/**
 * What distinguishes one cover from another.
 *
 * Serialised rather than switched on `kind`, because a switch here would be a
 * list of provider names in `domain/`, which is the branching the
 * architecture gate exists to stop. A cover is a small flat record, and two
 * built the same way serialise the same way; two that somehow differ only in
 * key order simply miss the cache, which costs sharing and not correctness.
 */
export const coverKey = (cover: CoverSource): string => JSON.stringify(cover);

const idsKey = (ids: ExternalIds): string => {
  const fields = Object.keys(ids);
  if (fields.length === 0) return '';
  return fields
    .sort()
    .map(field => `${field}=${(ids as Record<string, unknown>)[field]}`)
    .join(',');
};

function share<T>(store: Map<string, T>, key: string, value: T): T {
  const existing = store.get(key);
  if (existing !== undefined) return existing;
  if (store.size < MAX_ENTRIES) store.set(key, value);
  return value;
}

export const internCover = (cover: CoverSource): CoverSource =>
  share(covers, coverKey(cover), cover);

export const internArtistRef = (ref: ArtistRef): ArtistRef =>
  share(
    artistRefs,
    `${ref.localId}|${ref.nativeId}|${ref.name}|${coverKey(ref.cover)}|${idsKey(ref.externalIds)}`,
    ref
  );

export const internAlbumRef = (ref: AlbumRef): AlbumRef =>
  share(
    albumRefs,
    `${ref.localId}|${ref.nativeId}|${ref.title}|${coverKey(ref.cover)}|${idsKey(ref.externalIds)}`,
    ref
  );

/**
 * Forgets every shared value.
 *
 * Called where a catalog is dropped — signing out, or switching server — so
 * one account's names do not stay reachable behind the next one's.
 */
export function clearInternedRefs(): void {
  artistRefs.clear();
  albumRefs.clear();
  covers.clear();
}
