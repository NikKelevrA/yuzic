/**
 * Where an entity came from.
 *
 * Provenance is the origin of a record, and it never changes. It is not a
 * statement about whether the user owns the thing — that is `LibraryState`,
 * which does change — and it is not a statement about which provider can
 * currently answer questions about it, which is a capability lookup.
 *
 * The split is between the two kinds of provider the app has: exactly one
 * active music server (required core, the thing the user's library lives on)
 * and any number of optional integrations (Deezer, MusicBrainz, Last.fm). A
 * record from a server is scoped to that server's id, because the same album
 * on two configured servers is two distinct records with two distinct ids.
 */

/** A record that came from the user's own music server or local files. */
interface ServerProvenance {
  origin: 'server';
  /** The configured server this record lives on — `Server.id`, not a brand. */
  serverId: string;
}

/** A record that came from an optional integration's catalogue. */
interface IntegrationProvenance {
  origin: 'integration';
  /** The provider that returned it, e.g. `'deezer'`, as declared in the registry. */
  providerId: string;
}

export type Provenance = ServerProvenance | IntegrationProvenance;

/**
 * One object per origin, shared by every record from it.
 *
 * A provenance is a value: two records from the same server have the same
 * origin, not equal copies of it. Returning a fresh object per call meant a
 * 90,000 track library held 90,000 identical `{ origin, serverId }` pairs,
 * and the same again for its albums and artists.
 *
 * Object *count* is what costs, more than object size: interning provenance,
 * the artist and album references and the cover takes a track from 1,405 to
 * 682 bytes, which is 121 MB down to 59 MB at 90,000 tracks. No caller
 * changes, because the shape does not.
 *
 * Bounded by how many servers and integrations are configured, so there is
 * nothing to evict. Provenance never changes, which is what makes sharing it
 * safe — see the note at the top of this file.
 */
const serverProvenances = new Map<string, ServerProvenance>();
const integrationProvenances = new Map<string, IntegrationProvenance>();

export const serverProvenance = (serverId: string): ServerProvenance => {
  const existing = serverProvenances.get(serverId);
  if (existing) return existing;
  const created: ServerProvenance = { origin: 'server', serverId };
  serverProvenances.set(serverId, created);
  return created;
};

export const integrationProvenance = (providerId: string): IntegrationProvenance => {
  const existing = integrationProvenances.get(providerId);
  if (existing) return existing;
  const created: IntegrationProvenance = { origin: 'integration', providerId };
  integrationProvenances.set(providerId, created);
  return created;
};

/**
 * The origin's own identifier, for use where a single opaque scope string is
 * needed. Deliberately not a display name: nothing user-facing should be
 * derived from this.
 */
export const provenanceScope = (provenance: Provenance): string =>
  provenance.origin === 'server' ? provenance.serverId : provenance.providerId;
