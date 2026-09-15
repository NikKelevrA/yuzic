/**
 * The `artist.enrich` broker: adapts the user's Metadata › Artist info switch
 * (`features/settings/sources`) into the `BrokerInput` shape
 * `resolveArtistDetails` (`features/artist`) consults.
 *
 * This is where a provider is named for policy purposes — deciding which
 * provider serves which settings switch — so it lives in the registry
 * alongside every other provider declaration. Feature code asks for
 * `useMetadataEnrichmentBroker()` and never sees a provider id.
 *
 * Only a biography and tags are enriched here, and only by Last.fm. Pictures
 * are not enrichment: every artist and album image, whoever supplied the
 * item, goes through `features/artwork/coverResolution`, whose backups are the
 * Metadata › Artwork list.
 */
import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { lastfmProvider } from './lastfm';
import type { BrokerInput } from './capabilityBroker';
import type { CapabilityName } from '../contracts/Capabilities';
import type { Provider, ProviderId } from '../contracts/Provider';
import { selectSourceUse } from '@/features/settings/sources/state';

const PROVIDERS: readonly Provider[] = [lastfmProvider];

const ORDER: readonly ProviderId[] = [lastfmProvider.id];

/**
 * One policy-gated broker over the artist-info sources, for
 * `resolveArtistDetails` to consult. Last.fm is keyless from the user's side,
 * so it is treated as always reachable — same as its own `testConnection` —
 * and self-guards on its bundled key inside its capability.
 */
export function useMetadataEnrichmentBroker(): BrokerInput {
  const artistInfoEnabled = useSelector(selectSourceUse('lastfm.artistInfo'));

  return useMemo<BrokerInput>(() => {
    const isAllowed = (id: ProviderId, capability: CapabilityName): boolean =>
      capability === 'artist.enrich' && id === lastfmProvider.id && artistInfoEnabled;

    return {
      providers: PROVIDERS,
      isConnected: () => true,
      isAllowed,
      order: ORDER,
    };
  }, [artistInfoEnabled]);
}

/**
 * The i18n key for a `metadata.enrich` provider's display name (for the
 * small "via …" source line a resolved field's UI draws) — reuses each
 * provider's own `presentation.nameKey` rather than a second copy of the
 * label, and keeps the provider id itself out of caller code.
 * `null` for an id this broker doesn't recognize.
 */
export function metadataSourceNameKey(providerId: ProviderId): string | null {
  return PROVIDERS.find(p => p.id === providerId)?.presentation.nameKey ?? null;
}
