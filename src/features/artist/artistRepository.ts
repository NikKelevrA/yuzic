/**
 * The single place that turns "which artist" into one canonical `Artist`.
 *
 * A repository asks exactly one origin for the base record and relates it to
 * the user's library through matching — it does not itself go on to ask
 * Last.fm for a biography or Deezer for a nicer photo; that is enrichment's
 * job (`resolveArtistDetails.ts`), consulted separately and only when a
 * feature actually wants it. Today's artist screen instead fires a server
 * call, a Deezer call and a MusicBrainz call in parallel just to render a
 * header — this is what stops that fan-out at its root.
 *
 * `CapabilityMap` (`src/providers/contracts/Capabilities.ts`, out of this
 * feature's file scope) declares `catalogue.album` but no `catalogue.artist`
 * — there is no broker-mediated way to fetch a bare artist from an
 * integration today. The only origin an artist identity can name is
 * therefore the active server; a browsed/external origin is future work
 * gated on that capability existing, not something this file can invent.
 */
import { matchArtistToLibrary } from '@/features/library/matchToLibrary';
import type { Artist } from '@/domain/entities/Artist';
import type { ArtistsApi } from '@/providers/contracts/ServerAdapter';

/** How to find one artist. `server` is the only origin the broker's
 *  `CapabilityMap` currently names for a bare artist fetch. */
export type ArtistIdentity = {
  kind: 'server';
  /** The artist's id at the active server — `ArtistsApi.get`'s `id`. */
  nativeId: string;
};

export interface ArtistRepositoryDeps {
  /** The one origin this identity resolves to. */
  api: Pick<ArtistsApi, 'get'>;
  /**
   * The library's currently-loaded artists, for relating the fetched record
   * to library presence. A server-origin fetch is already a library record
   * in the overwhelmingly common case (the server IS the library), so
   * matching mostly matters once a `catalogue`-origin identity exists — it
   * is threaded through now so that day doesn't need a second signature
   * change here.
   */
  libraryArtists: readonly Artist[];
}

/**
 * Fetches one artist from its single origin and relates it to the library.
 *
 * When the fetched record matches an already-loaded library artist (by
 * shared identifier, or conservatively by normalized name), the library
 * record is returned instead of the freshly-fetched one: one canonical
 * entity, never a `localArtist ?? externalArtist` pair for a screen to
 * reconcile for itself.
 */
export async function getArtist(
  identity: ArtistIdentity,
  deps: ArtistRepositoryDeps
): Promise<Artist> {
  const base = await deps.api.get(identity.nativeId);
  const matched = matchArtistToLibrary(
    { externalIds: base.externalIds, name: base.name },
    deps.libraryArtists
  );
  return matched ?? base;
}
