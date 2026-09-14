/**
 * Last.fm as an integration provider.
 *
 * `auth: { tier: 'none' }` — the api_key is a build-time constant baked into
 * the app (`LASTFM_API_KEY`, a public app identifier per its own doc
 * comment), not a per-user credential, so this is a plain declaration rather
 * than a factory: there is nothing a caller could supply that isn't already
 * fixed at build time. Every capability guards on the key being present the
 * same way `src/api/lastfm`'s own functions do.
 */
import { getLastFmArtistInfo, getLastFmSimilarArtists } from '@/providers/integration/lastfm';
import { LASTFM_API_KEY } from '@/constants/keys';
import { sourceColor } from '@/constants/design';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import type { Artist } from '@/domain/entities/Artist';
import type { IntegrationProvider } from '../contracts/Provider';

const PROVENANCE = integrationProvenance('lastfm');

export const lastfmProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'lastfm',
  // No dedicated icon asset exists for Last.fm today — see the file report.
  presentation: { nameKey: 'settings.metadata.lastfm', icon: 0, color: sourceColor.lastfm },
  auth: { tier: 'none' },
  capabilities: {
    'artist.enrich': async artist => {
      if (!LASTFM_API_KEY || !artist.name.trim()) return null;
      const info = await getLastFmArtistInfo(LASTFM_API_KEY, artist.name);
      if (!info) return null;
      return { biography: info.bio ?? undefined, tags: info.tags };
    },
    'similarity.artists': async (artist, limit) => {
      if (!LASTFM_API_KEY || !artist.name.trim()) return [];
      const raw = await getLastFmSimilarArtists(LASTFM_API_KEY, artist.name, limit);
      // Last.fm names no artist id of its own on this endpoint — its mbid
      // where present, else the artist's name, is all there is to key on.
      // Same mapping `src/features/artist/useSimilarArtists.ts` already does.
      return raw.map((candidate): Artist => {
        const nativeId = candidate.mbid ?? candidate.name;
        return {
          localId: makeLocalId('artist', PROVENANCE, nativeId),
          nativeId,
          provenance: PROVENANCE,
          externalIds: candidate.mbid ? { mbid: candidate.mbid } : {},
          libraryState: 'external',
          name: candidate.name,
          cover: { kind: 'none' },
          tags: [],
          albumIds: [],
        };
      });
    },
  },
  // Keyless read endpoint — reachable by construction whenever the bundled
  // key is present.
  testConnection: async () => ({ ok: Boolean(LASTFM_API_KEY) }),
};
