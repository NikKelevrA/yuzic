/**
 * Last.fm as an integration provider.
 *
 * `auth: { tier: 'none' }` — the api_key is a build-time constant baked into
 * the app (`LASTFM_API_KEY`, a public app identifier per its own doc
 * comment), not a per-user credential, so this is a plain declaration rather
 * than a factory: there is nothing a caller could supply that isn't already
 * fixed at build time. Every capability guards on the key being present the
 * same way `src/providers/integration/lastfm`'s own functions do.
 */
import { getLastFmArtistInfo } from '@/providers/integration/lastfm';
import { LASTFM_API_KEY } from '@/constants/keys';
import { sourceColor } from '@/constants/design';
import type { IntegrationProvider } from '../contracts/Provider';

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
  },
  // Keyless read endpoint — reachable by construction whenever the bundled
  // key is present.
  testConnection: async () => ({ ok: Boolean(LASTFM_API_KEY) }),
};
