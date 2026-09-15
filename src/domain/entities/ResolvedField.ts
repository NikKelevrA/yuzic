/**
 * A value together with who supplied it.
 *
 * Enrichment fills gaps in a record from providers that are not its origin —
 * a biography from one service, artwork from another. Once that happens, "what
 * is this album's cover" has more than one possible answer, and a bare value
 * cannot say which one it is. The UI needs to (a "via Deezer" line), the user
 * needs to when deciding source order, and a bug report needs to when the
 * artwork is wrong.
 *
 * Resolution is a read-time result, never written back onto the entity.
 * Persisting an enriched field would make a provider's guess indistinguishable
 * from what the origin actually said, and disabling that provider afterwards
 * could not undo it.
 */
import type { ProviderId } from '@/providers/contracts/Provider';

export interface ResolvedField<T> {
  value: T;
  /** Which provider supplied it. The entity's own origin counts. */
  sourceId: ProviderId;
}

export const resolved = <T>(value: T, sourceId: ProviderId): ResolvedField<T> =>
  ({ value, sourceId });

/**
 * The first field that has a value, in the order given.
 *
 * First-hit-wins is the default because enrichment sources are ranked by the
 * user, and blending two providers' answers to one question produces a record
 * that is true of neither. A feature that genuinely wants to combine sources
 * says so explicitly rather than getting it by accident here.
 */
export function firstResolved<T>(
  candidates: readonly (ResolvedField<T> | null | undefined)[]
): ResolvedField<T> | null {
  return candidates.find((candidate): candidate is ResolvedField<T> =>
    candidate != null && candidate.value !== undefined && candidate.value !== null) ?? null;
}
