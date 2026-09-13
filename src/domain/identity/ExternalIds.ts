/**
 * Identifiers this entity is known by outside its own origin.
 *
 * These are the currency of matching: an MBID or an ISRC identifies a work
 * across providers in a way a title never can. They are additive — a record
 * gains ids as providers resolve it — and they are always about the entity
 * itself, never about its neighbours. An album does not carry its artist's
 * MBID here; the album's `artist` reference carries that.
 *
 * Every field is optional because no provider supplies all of them, and an
 * absent id must stay distinguishable from an id known to be absent upstream.
 */
export interface ExternalIds {
  /** MusicBrainz id. For an album this is a release or release-group id. */
  mbid?: string;
  /** Which of the two an album's `mbid` is — Cover Art Archive needs to know. */
  mbidType?: 'release' | 'release-group';
  /** Deezer's numeric id, as a string. */
  deezerId?: string;
  /** Recording identifier, songs only. */
  isrc?: string;
  /** Release barcode, albums only. */
  upc?: string;
}

export const EMPTY_EXTERNAL_IDS: ExternalIds = Object.freeze({});

/**
 * Merges newly resolved ids over known ones.
 *
 * Existing values win: an id already recorded came from the entity's own
 * origin or from an earlier, higher-priority resolution, and a later provider
 * guessing differently must not silently overwrite it.
 */
export function mergeExternalIds(known: ExternalIds, resolved: ExternalIds): ExternalIds {
  const merged: ExternalIds = { ...resolved, ...known };
  for (const key of Object.keys(merged) as (keyof ExternalIds)[]) {
    if (merged[key] === undefined) delete merged[key];
  }
  return merged;
}
