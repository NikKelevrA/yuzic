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

/**
 * Normalises a loosely-typed id bag into the domain's strict one.
 *
 * Provider payloads and the pre-rewrite types express "no id" as `null` as
 * often as by omission. The domain uses omission only, so that an id known to
 * be absent and an id never asked for stay indistinguishable from each other
 * and both stay distinguishable from an id that is present.
 */
export function normalizeExternalIds(ids: unknown): ExternalIds {
  if (!ids || typeof ids !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(ids)) {
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out as ExternalIds;
}

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
