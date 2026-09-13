/**
 * Deciding that two records describe the same real-world work.
 *
 * Matching is fallible, so it produces a *relation* — a candidate with a
 * reason and a confidence — and never an identity. Nothing here writes to a
 * `LocalId` or merges two entities: a Deezer album related to a library album
 * remains two records that are known to correspond, which is what lets the UI
 * say "you have this" without pretending the external record was the local one
 * all along.
 *
 * Identifier matches are exact and trustworthy. The normalised name fallback
 * is deliberately conservative: it requires both sides of a pair (title *and*
 * artist for an album) because titles alone collide constantly across an
 * artist's discography and across covers of the same song.
 */
import type { ExternalIds } from './ExternalIds';
import type { LocalId } from './LocalId';

/** Why two records were considered the same. Ordered strongest first. */
export type MatchReason = 'mbid' | 'isrc' | 'upc' | 'deezerId' | 'normalizedName';

export const MATCH_REASON_PRECEDENCE: readonly MatchReason[] = Object.freeze([
  'mbid', 'isrc', 'upc', 'deezerId', 'normalizedName',
]);

export interface Match<T> {
  candidate: T;
  reason: MatchReason;
  /** `exact` comes from a shared identifier; `heuristic` from normalised names. */
  confidence: 'exact' | 'heuristic';
}

/**
 * Case, surrounding space and runs of whitespace are display noise rather than
 * identity. Nothing beyond that is stripped: removing punctuation or
 * parenthesised suffixes would merge "Song" with "Song (Live)".
 */
export const normalizeName = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, ' ');

/** The identifier fields that can carry an exact match, strongest first. */
const ID_FIELDS: readonly (readonly [MatchReason, keyof ExternalIds])[] = Object.freeze([
  ['mbid', 'mbid'],
  ['isrc', 'isrc'],
  ['upc', 'upc'],
  ['deezerId', 'deezerId'],
]);

/**
 * The strongest shared identifier between two records, if any.
 *
 * An MBID match is only honoured when both sides agree on what the MBID
 * identifies: a release id and a release-group id are different things, and
 * comparing them is how an album gets matched to its own boxed set.
 */
export function sharedIdentifier(a: ExternalIds, b: ExternalIds): MatchReason | null {
  for (const [reason, field] of ID_FIELDS) {
    const left = a[field];
    const right = b[field];
    if (!left || !right || left !== right) continue;
    if (field === 'mbid' && a.mbidType && b.mbidType && a.mbidType !== b.mbidType) continue;
    return reason;
  }
  return null;
}

/** What a candidate must expose to be matched. Deliberately structural. */
export interface Matchable {
  localId: LocalId;
  externalIds: ExternalIds;
}

/** The display fields the conservative fallback compares, already paired. */
export interface NameKey {
  /** The entity's own name: an artist's name, an album or song title. */
  primary: string;
  /**
   * The name that disambiguates it — an album or song's artist. Absent for an
   * artist, which has nothing to pair with and so matches on name alone.
   */
  secondary?: string;
}

const nameKeysAgree = (a: NameKey, b: NameKey): boolean => {
  if (normalizeName(a.primary) !== normalizeName(b.primary)) return false;
  // A missing secondary on either side means the caller had nothing to
  // disambiguate with; requiring equality there would reject every valid
  // artist match.
  if (a.secondary === undefined || b.secondary === undefined) return true;
  return normalizeName(a.secondary) === normalizeName(b.secondary);
};

/**
 * Finds the best match for `subject` among `candidates`.
 *
 * Identifier matches are preferred over name matches, and stronger identifiers
 * over weaker ones, regardless of candidate order — so the result does not
 * depend on how the library happened to be sorted.
 */
export function findMatch<T extends Matchable>(
  subject: { externalIds: ExternalIds; nameKey: NameKey },
  candidates: readonly T[],
  nameKeyOf: (candidate: T) => NameKey
): Match<T> | null {
  let best: Match<T> | null = null;

  const consider = (match: Match<T>) => {
    if (!best) { best = match; return; }
    const rank = (m: Match<T>) => MATCH_REASON_PRECEDENCE.indexOf(m.reason);
    if (rank(match) < rank(best)) best = match;
  };

  for (const candidate of candidates) {
    const reason = sharedIdentifier(subject.externalIds, candidate.externalIds);
    if (reason) { consider({ candidate, reason, confidence: 'exact' }); continue; }
    if (nameKeysAgree(subject.nameKey, nameKeyOf(candidate))) {
      consider({ candidate, reason: 'normalizedName', confidence: 'heuristic' });
    }
  }

  return best;
}
