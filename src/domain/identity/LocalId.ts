/**
 * A stable, on-device identity for one domain entity.
 *
 * Identity is derived from provenance and the entity's native id at the origin
 * — never from display metadata. A title or an artist name can be corrected,
 * retagged, or localised; an identity that moved when that happened would
 * silently orphan every queue entry, download and playlist row pointing at it.
 *
 * Identity is also deliberately separate from *matching* (deciding that two
 * records describe the same real-world work, see ./matching). Two records from
 * two origins always get two different `LocalId`s, even when they are obviously
 * the same album. Matching relates them; it never merges them.
 *
 * The scheme is a readable namespaced string rather than a hash, so that a
 * value in a log, a persisted queue or a crash report can be read by a person:
 *
 *   local:album:srv:{serverId}:{nativeId}
 *   local:album:ext:{providerId}:{nativeId}
 *
 * The scope segment is percent-encoded and the native id is not. Scopes are
 * `nanoid()` server ids and registry provider literals, neither of which
 * contains a colon today — but a colon appearing there would silently shift
 * the boundary between scope and native id and re-point every id on the
 * device. Encoding one segment makes the split unambiguous without an
 * assertion that could fire at map time. Native ids genuinely do contain
 * colons (namespaced podcast ids), so the parser takes everything after the
 * scope as the native id.
 */
import type { Provenance } from './Provenance';

export type LocalId = string & { readonly __brand: 'LocalId' };

/** The kinds of entity that have their own identity. */
type EntityKind = 'artist' | 'album' | 'song' | 'playlist';

/**
 * Builds the identity for an entity. Synchronous, offline, and total: the same
 * inputs always produce the same id, and any difference in kind, origin or
 * native id produces a different one.
 */
export function makeLocalId(kind: EntityKind, provenance: Provenance, nativeId: string): LocalId {
  const scope = provenance.origin === 'server'
    ? `srv:${encodeURIComponent(provenance.serverId)}`
    : `ext:${encodeURIComponent(provenance.providerId)}`;
  return `local:${kind}:${scope}:${nativeId}` as LocalId;
}

/**
 * Reads an id back into its parts. Returns null for anything not produced by
 * `makeLocalId`, so a caller cannot accidentally treat a raw server id as one.
 */
export function parseLocalId(
  id: string
): { kind: EntityKind; provenance: Provenance; nativeId: string } | null {
  const match = /^local:(artist|album|song|playlist):(srv|ext):([^:]*):(.*)$/.exec(id);
  if (!match) return null;
  const [, kind, scopeKind, scope, nativeId] = match;
  if (!scope || !nativeId) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(scope);
  } catch {
    // A malformed escape means this was not produced by makeLocalId.
    return null;
  }
  return {
    kind: kind as EntityKind,
    provenance: scopeKind === 'srv'
      ? { origin: 'server', serverId: decoded }
      : { origin: 'integration', providerId: decoded },
    nativeId,
  };
}

export const isLocalId = (id: string): id is LocalId => parseLocalId(id) !== null;
