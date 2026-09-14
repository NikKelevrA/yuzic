/**
 * SoulSync as an integration provider.
 *
 * Needs the user's own server URL + API key (`SoulSyncConfig`), so this is a
 * factory: `createSoulSyncProvider(config)`. SoulSync takes a track and
 * nothing else — no album endpoint — so only `acquisition.track` is
 * declared, matching `src/features/downloaders/registry.ts`'s own comment.
 */
import { downloadTrack, testConnection as testSoulSyncConnection, SoulSyncError, type SoulSyncConfig } from '@/providers/integration/soulsync';
import type { IntegrationProvider } from '../contracts/Provider';

export function createSoulSyncProvider(config: SoulSyncConfig): IntegrationProvider {
  return {
    kind: 'integration',
    id: 'soulsync',
    // No dedicated icon asset exists for SoulSync today — see the file report.
    presentation: { nameKey: 'settings.downloaders.soulsync.title', icon: 0 },
    auth: { tier: 'apiKey', configKeys: ['serverUrl', 'apiKey'] },
    capabilities: {
      'acquisition.track': async request => {
        try {
          await downloadTrack(config, { title: request.title, artist: request.artist });
          return { accepted: true };
        } catch (error) {
          const message = error instanceof SoulSyncError ? error.message : 'SoulSync request failed';
          return { accepted: false, message };
        }
      },
    },
    testConnection: async () => {
      try {
        const ok = await testSoulSyncConnection(config);
        return { ok };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'SoulSync connection failed' };
      }
    },
  };
}
