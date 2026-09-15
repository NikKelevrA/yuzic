/**
 * Attributed enrichment for one artist's biography and tags.
 *
 * The origin's own value is authoritative: a field the artist's own record
 * already carries is never re-asked of an integration. A field that is
 * missing is filled by a single enabled integration, in the broker's order,
 * stopping at the first one that supplies it. Each field is resolved
 * independently — a biography from one provider must not block tags from
 * another.
 *
 * The artist's picture is not resolved here. Every image goes through
 * `features/artwork/coverResolution`, whoever supplied the item.
 *
 * Nothing here is written back onto the `Artist` record — see
 * `ResolvedField.ts`'s own doc comment for why. Disabling a provider is
 * handled entirely by `broker.order`/`isAllowed`. A caller building a query
 * key for this should include the artist's identity and the ordered policy
 * (`broker.order`) — changing the source order must produce a different
 * cache entry, not a stale one.
 *
 * Providers are only ever reached through `offersFor` — this file never
 * names a provider by id.
 */
import { offersFor, type BrokerInput } from '@/providers/registry/capabilityBroker';
import { resolved, type ResolvedField } from '@/domain/entities/ResolvedField';
import { provenanceScope } from '@/domain/identity/Provenance';
import type { Artist } from '@/domain/entities/Artist';

export interface ResolvedArtist {
  entity: Artist;
  biography?: ResolvedField<string>;
  tags?: ResolvedField<string[]>;
}

export interface ResolveArtistDetailsInput {
  artist: Artist;
  /** Enumerates and orders `artist.enrich` offers — built by the caller from
   *  the user's configured integration enablement, never hardcoded. */
  broker: BrokerInput;
}

/**
 * Resolves biography/tags for one artist, gap-filling only what the artist's
 * own record does not already have.
 *
 * A field the artist already carries is returned immediately, attributed to
 * the artist's own origin, with zero `artist.enrich` calls when nothing is
 * missing. Missing fields are filled from `artist.enrich` offers in the
 * broker's order — each offer is invoked at most once, and no further offer is
 * invoked once every missing field has been filled.
 */
export async function resolveArtistDetails(input: ResolveArtistDetailsInput): Promise<ResolvedArtist> {
  const { artist, broker } = input;
  const originId = provenanceScope(artist.provenance);

  let biography = artist.biography ? resolved(artist.biography, originId) : undefined;
  let tags = artist.tags.length > 0 ? resolved(artist.tags, originId) : undefined;

  const stillMissing = () => !biography || !tags;

  if (stillMissing()) {
    for (const offer of offersFor(broker, 'artist.enrich')) {
      if (!stillMissing()) break;

      const enrichment = await offer.invoke(artist);
      if (!enrichment) continue;

      if (!biography && enrichment.biography) {
        biography = resolved(enrichment.biography, offer.providerId);
      }
      if (!tags && enrichment.tags && enrichment.tags.length > 0) {
        tags = resolved(enrichment.tags, offer.providerId);
      }
    }
  }

  return { entity: artist, biography, tags };
}
