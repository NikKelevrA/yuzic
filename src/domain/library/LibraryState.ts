/**
 * How an entity stands relative to the user's library and the sources they
 * have enabled.
 *
 * Unlike provenance, this changes: an album browsed on Deezer becomes
 * `wanted` when the user saves it, `acquirable` when a downloader that could
 * fetch it is connected, and `in-library` once it has actually arrived on the
 * server and been synced.
 *
 * These four are deliberately distinct. Collapsing them into one "have it /
 * don't" flag is what made intent, capability and presence indistinguishable
 * in the UI, so a wanted album and a downloadable one looked identical.
 */
export type LibraryState =
  /** Present on the active server or in local files — the user has it. */
  | 'in-library'
  /** The user declared save-only intent; nothing has been fetched. */
  | 'wanted'
  /** Not owned, but a connected acquisition provider could get it. */
  | 'acquirable'
  /** Known only through an enabled integration; browse and preview only. */
  | 'external';

/**
 * Precedence, strongest first.
 *
 * A record can satisfy several of these at once — a wanted album is usually
 * also acquirable, and always also external — so the order is what makes the
 * answer single-valued. Presence beats intent, intent beats capability, and
 * capability beats mere visibility.
 */
export const LIBRARY_STATE_PRECEDENCE: readonly LibraryState[] = Object.freeze([
  'in-library',
  'wanted',
  'acquirable',
  'external',
]);

/** The facts known about an entity at the moment its state is computed. */
export interface LibraryFacts {
  /** Present on the active server or in local files. */
  isPresent: boolean;
  /** The user has saved it as intent. */
  isWanted: boolean;
  /** A connected acquisition provider could fetch it. */
  isAcquirable: boolean;
}

/**
 * Resolves the facts to one state. Total by construction: `external` is the
 * floor, so there is no "unknown" case for a caller to forget to handle.
 */
export function resolveLibraryState(facts: LibraryFacts): LibraryState {
  if (facts.isPresent) return 'in-library';
  if (facts.isWanted) return 'wanted';
  if (facts.isAcquirable) return 'acquirable';
  return 'external';
}

/** Whether `a` outranks `b` in the precedence above. */
export function isStrongerLibraryState(a: LibraryState, b: LibraryState): boolean {
  return LIBRARY_STATE_PRECEDENCE.indexOf(a) < LIBRARY_STATE_PRECEDENCE.indexOf(b);
}
