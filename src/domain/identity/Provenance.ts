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
export interface ServerProvenance {
  origin: 'server';
  /** The configured server this record lives on — `Server.id`, not a brand. */
  serverId: string;
}

/** A record that came from an optional integration's catalogue. */
export interface IntegrationProvenance {
  origin: 'integration';
  /** The provider that returned it, e.g. `'deezer'`, as declared in the registry. */
  providerId: string;
}

export type Provenance = ServerProvenance | IntegrationProvenance;

export const serverProvenance = (serverId: string): ServerProvenance =>
  ({ origin: 'server', serverId });

export const integrationProvenance = (providerId: string): IntegrationProvenance =>
  ({ origin: 'integration', providerId });

export const isServerOriginated = (provenance: Provenance): provenance is ServerProvenance =>
  provenance.origin === 'server';

/**
 * The origin's own identifier, for use where a single opaque scope string is
 * needed. Deliberately not a display name: nothing user-facing should be
 * derived from this.
 */
export const provenanceScope = (provenance: Provenance): string =>
  provenance.origin === 'server' ? provenance.serverId : provenance.providerId;
