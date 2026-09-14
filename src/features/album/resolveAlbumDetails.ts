/**
 * Attributed enrichment for one album's cover.
 *
 * Same shape and rules as `resolveArtistDetails.ts`: the origin's own cover
 * is authoritative and short-circuits every provider call; a missing cover
 * is filled by the first enabled `album.enrich` offer, in the user's order,
 * that has one. `AlbumEnrichment` (`Capabilities.ts`) carries only `cover`
 * and `externalIds` — there is no biography/tags field to resolve for an
 * album — so there is only the one field here, but the shape stays a record
 * rather than a bare `ResolvedField<CoverSource>` so a second attributed
 * album field can be added later without changing every call site's shape.
 *
 * This is also where the album-only Cover Art Archive correction lives
 * structurally, not by any check in this file: `album.enrich` is the only
 * capability that can ever attach a `coverartarchive` cover
 * (`musicbrainzProvider['album.enrich']`, keyed on a release-group id from a
 * title+artist search — see `src/providers/registry/musicbrainz.test.ts`).
 * `resolveArtistDetails.ts` only ever consults `artist.enrich`, whose
 * `musicbrainzProvider` implementation never populates a cover at all — an
 * artist's own mbid is therefore structurally unreachable from either
 * resolver's code path.
 */
import { offersFor, type BrokerInput } from '@/providers/registry/capabilityBroker';
import { resolved, type ResolvedField } from '@/domain/entities/ResolvedField';
import { provenanceScope } from '@/domain/identity/Provenance';
import type { Album } from '@/domain/entities/Album';
import type { CoverSource } from '@/domain/entities/Cover';

export interface ResolvedAlbum {
  entity: Album;
  cover: ResolvedField<CoverSource>;
}

export interface ResolveAlbumDetailsInput {
  album: Album;
  /** Enumerates and orders `album.enrich` offers — built by the caller from
   *  the user's configured integration order/enablement, never hardcoded. */
  broker: BrokerInput;
}

const hasCover = (cover: CoverSource): boolean => cover.kind !== 'none';

/**
 * Resolves the cover for one album, gap-filling only when the album's own
 * record has none.
 *
 * Zero `album.enrich` calls when the album already has a cover. Offers are
 * tried in the broker's order, each invoked at most once, stopping at the
 * first one that supplies a usable cover.
 */
export async function resolveAlbumDetails(input: ResolveAlbumDetailsInput): Promise<ResolvedAlbum> {
  const { album, broker } = input;
  const originId = provenanceScope(album.provenance);

  if (hasCover(album.cover)) {
    return { entity: album, cover: resolved(album.cover, originId) };
  }

  for (const offer of offersFor(broker, 'album.enrich')) {
    const enrichment = await offer.invoke(album);
    if (enrichment?.cover && hasCover(enrichment.cover)) {
      return { entity: album, cover: resolved(enrichment.cover, offer.providerId) };
    }
  }

  return { entity: album, cover: resolved({ kind: 'none' }, originId) };
}
