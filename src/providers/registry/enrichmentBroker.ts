/**
 * The `metadata.enrich` broker: adapts the user's existing artist-info /
 * artwork settings (`features/settings/metadata/state.ts`) into the
 * `BrokerInput` shape `resolveArtistDetails`/`resolveAlbumDetails`
 * (`features/artist`, `features/album`) consult.
 *
 * This is where a provider is named for policy purposes — deciding which
 * provider serves which settings toggle — so it lives in the registry
 * alongside every other provider declaration, per this directory's own
 * "where a provider declares itself" role (see `providers.ts`'s file
 * comment). Feature code asks for `useMetadataEnrichmentBroker()` and never
 * sees a provider id.
 *
 * Only providers the OLD fetcher-based resolvers this replaces
 * (`features/metadata/resolveArtistInfo.ts`, `resolveArtwork.ts` — deleted
 * alongside this file's introduction) actually used for a given field are
 * ever allowed to serve it here, so the migration changes no observable
 * behaviour:
 *  - `artist.enrich` biography/tags: Last.fm only (the old
 *    `ALL_ARTIST_INFO_SOURCES` was `['lastfm']` — MusicBrainz's own
 *    `artist.enrich` can also return a biography, but the old artist-info
 *    chain never called MusicBrainz, so it stays disallowed here too, to
 *    avoid silently adding a source nothing has ever tested against).
 *  - `artist.enrich` cover: Deezer only (the old artwork chain's
 *    `coverartarchive` fetcher only ever resolved a "release" or
 *    "release-group" mbid, which an artist lookup never has — see the old
 *    `enrichmentFetchers.ts`'s guard — so it never contributed to an
 *    artist's cover in practice).
 *  - `album.enrich` cover: Deezer and MusicBrainz (Cover Art Archive is
 *    implemented as `musicbrainzProvider['album.enrich']` — see
 *    `resolveAlbumDetails.ts`'s doc comment).
 */
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { lastfmProvider } from './lastfm';
import { deezerProvider } from './deezer';
import { musicbrainzProvider } from './musicbrainz';
import type { BrokerInput } from './capabilityBroker';
import type { CapabilityName } from '../contracts/Capabilities';
import type { Provider, ProviderId } from '../contracts/Provider';
import {
  selectLastfmEnabled,
  selectMetadataArtistInfoOrder,
  selectMetadataArtworkOrder,
  selectMetadataArtworkSourceEnabled,
} from '@/features/settings/metadata/state';

const PROVIDERS: readonly Provider[] = [lastfmProvider, deezerProvider, musicbrainzProvider];

/** The old artwork chain's `coverartarchive` source id names Cover Art
 *  Archive, which this registry exposes through the MusicBrainz provider's
 *  `album.enrich` — not a provider of its own. */
const artworkSourceToProviderId = (sourceId: string): ProviderId =>
  sourceId === 'coverartarchive' ? musicbrainzProvider.id : sourceId;

/**
 * One ordered, policy-gated broker over Last.fm/Deezer/MusicBrainz, for
 * `resolveArtistDetails`/`resolveAlbumDetails` to consult. These are all
 * keyless integrations, so each is treated as always reachable — same as
 * each one's own `testConnection` — and self-guards on its own missing
 * credential (e.g. Last.fm's bundled key) inside its capability.
 */
export function useMetadataEnrichmentBroker(): BrokerInput {
  const artistInfoOrder = useSelector(selectMetadataArtistInfoOrder);
  const artworkOrder = useSelector(selectMetadataArtworkOrder);
  const bioSourceEnabled = useSelector(selectLastfmEnabled);
  const artworkIntegrationEnabled = useSelector(selectMetadataArtworkSourceEnabled(deezerProvider.id));
  const coverArtArchiveEnabled = useSelector(selectMetadataArtworkSourceEnabled('coverartarchive'));

  return useMemo<BrokerInput>(() => {
    const isAllowed = (id: ProviderId, capability: CapabilityName): boolean => {
      if (capability === 'artist.enrich') {
        if (id === lastfmProvider.id) return bioSourceEnabled;
        if (id === deezerProvider.id) return artworkIntegrationEnabled;
        return false;
      }
      if (capability === 'album.enrich') {
        if (id === deezerProvider.id) return artworkIntegrationEnabled;
        if (id === musicbrainzProvider.id) return coverArtArchiveEnabled;
        return false;
      }
      return false;
    };

    const order = Array.from(
      new Set([...artistInfoOrder, ...artworkOrder.map(artworkSourceToProviderId)])
    );

    return {
      providers: PROVIDERS,
      isConnected: () => true,
      isAllowed,
      order,
    };
  }, [artistInfoOrder, artworkOrder, bioSourceEnabled, artworkIntegrationEnabled, coverArtArchiveEnabled]);
}

/**
 * The i18n key for a `metadata.enrich` provider's display name (for the
 * small "via …" source line a resolved field's UI draws) — reuses each
 * provider's own `presentation.nameKey` rather than a second copy of the
 * label, and keeps the provider id itself out of caller code: a caller
 * holds only the opaque key string, never a name to match against.
 * `null` for an id this broker doesn't recognize.
 */
export function metadataSourceNameKey(providerId: ProviderId): string | null {
  return PROVIDERS.find(p => p.id === providerId)?.presentation.nameKey ?? null;
}
