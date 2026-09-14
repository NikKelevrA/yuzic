/**
 * Attributed enrichment for one artist's display-only fields.
 *
 * The origin's own value is authoritative: a field the artist's own record
 * already carries is never re-asked of an integration. A field that is
 * missing is filled by a single enabled integration, in the user's
 * preferred order, stopping at the first one that supplies it. Each field
 * (biography, tags, cover) is resolved independently — a biography hit from
 * one provider must not block a cover hit from a different one, and vice
 * versa; merging providers' answers into one accept-or-reject blob per
 * offer is exactly the bug this replaces (see the module report for where
 * that pattern lived before).
 *
 * Nothing here is written back onto the `Artist` record — see
 * `ResolvedField.ts`'s own doc comment for why. Disabling a provider is
 * handled entirely by `broker.order`/`isAllowed`: it removes that provider
 * from `offersFor`'s results, which is all "restore the server-only view"
 * requires — no cleanup step here. A caller building a query key for this
 * should include the artist's identity, the `'artist.enrich'` capability
 * name, and the ordered policy (`broker.order`) — changing the source order
 * must produce a different cache entry, not a stale one.
 *
 * Providers are only ever reached through `offersFor` — this file never
 * names a provider by id.
 */
import { offersFor, type BrokerInput } from '@/providers/registry/capabilityBroker';
import { resolved, type ResolvedField } from '@/domain/entities/ResolvedField';
import { provenanceScope } from '@/domain/identity/Provenance';
import type { Artist } from '@/domain/entities/Artist';
import type { CoverSource } from '@/domain/entities/Cover';

export interface ResolvedArtist {
  entity: Artist;
  biography?: ResolvedField<string>;
  tags?: ResolvedField<string[]>;
  cover: ResolvedField<CoverSource>;
}

export interface ResolveArtistDetailsInput {
  artist: Artist;
  /** Enumerates and orders `artist.enrich` offers — built by the caller from
   *  the user's configured integration order/enablement, never hardcoded. */
  broker: BrokerInput;
}

const hasCover = (cover: CoverSource): boolean => cover.kind !== 'none';

/**
 * Resolves biography/tags/cover for one artist, gap-filling only what the
 * artist's own record does not already have.
 *
 * A field the artist already carries is returned immediately, attributed to
 * the artist's own origin, with zero `artist.enrich` calls at all when
 * nothing is missing. Missing fields are filled from `artist.enrich` offers
 * in the broker's order — each offer is invoked at most once, and no further
 * offer is invoked once every still-missing field has been filled.
 */
export async function resolveArtistDetails(input: ResolveArtistDetailsInput): Promise<ResolvedArtist> {
  const { artist, broker } = input;
  const originId = provenanceScope(artist.provenance);

  let biography = artist.biography ? resolved(artist.biography, originId) : undefined;
  let tags = artist.tags.length > 0 ? resolved(artist.tags, originId) : undefined;
  let cover = hasCover(artist.cover) ? resolved(artist.cover, originId) : undefined;

  const stillMissing = () => !biography || !tags || !cover;

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
      if (!cover && enrichment.cover && hasCover(enrichment.cover)) {
        cover = resolved(enrichment.cover, offer.providerId);
      }
    }
  }

  return {
    entity: artist,
    biography,
    tags,
    cover: cover ?? resolved({ kind: 'none' }, originId),
  };
}
