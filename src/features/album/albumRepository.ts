/**
 * The single place that turns "which album" into one canonical `AlbumDetail`.
 *
 * Unlike artists, an album has a genuine second origin: `CapabilityMap`
 * declares `catalogue.album`, which MusicBrainz and Deezer both implement
 * (`src/providers/registry/musicbrainz.ts`, `.../deezer.ts`). So a `catalogue`
 * identity asks the broker for exactly one offer — the user's
 * highest-preference connected, allowed provider — never every integration
 * at once. Either way, this repository makes exactly one origin call and
 * then relates the result to library presence through matching; enrichment
 * (`resolveAlbumDetails.ts`) is a separate, later step.
 */
import { firstOfferFor, type BrokerInput } from '@/providers/registry/capabilityBroker';
import { matchAlbumToLibrary } from '@/features/library/matchToLibrary';
import type { Album } from '@/domain/entities/Album';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { AlbumsApi } from '@/providers/contracts/ServerAdapter';

export type AlbumIdentity =
  | { kind: 'server'; nativeId: string }
  | { kind: 'catalogue'; nativeId: string };

export interface AlbumRepositoryDeps {
  /** The origin for a `server` identity. */
  api: Pick<AlbumsApi, 'get'>;
  /** The origin for a `catalogue` identity — only consulted for that kind. */
  broker?: BrokerInput;
  /** The library's currently-loaded albums, for relating the fetched record
   *  to library presence. */
  libraryAlbums: readonly Album[];
}

async function fetchFromCatalogue(
  nativeId: string,
  broker: BrokerInput | undefined
): Promise<AlbumDetail> {
  const offer = broker ? firstOfferFor(broker, 'catalogue.album') : null;
  if (!offer) {
    throw new Error('No catalogue.album provider is available to resolve this album.');
  }
  const detail = await offer.invoke(nativeId);
  if (!detail) {
    throw new Error(`Album not found via ${offer.providerId}: ${nativeId}`);
  }
  return detail;
}

/**
 * Fetches one album from its single origin and relates it to the library.
 *
 * When the fetched album matches an already-loaded library album (by shared
 * identifier, or conservatively by normalized title+artist), the library
 * record is returned as the entity — one canonical `Album`, with the
 * just-fetched track list attached, rather than a browsed record and a
 * library record shown side by side for a screen to reconcile.
 */
export async function getAlbum(
  identity: AlbumIdentity,
  deps: AlbumRepositoryDeps
): Promise<AlbumDetail> {
  const detail =
    identity.kind === 'server'
      ? await deps.api.get(identity.nativeId)
      : await fetchFromCatalogue(identity.nativeId, deps.broker);

  const matched = matchAlbumToLibrary(
    {
      externalIds: detail.album.externalIds,
      title: detail.album.title,
      artistName: detail.album.artist.name,
    },
    deps.libraryAlbums
  );

  return matched ? { album: matched, songs: detail.songs } : detail;
}
