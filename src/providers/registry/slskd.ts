/**
 * slskd as an integration provider.
 *
 * Needs the user's own server URL + API key (`SlskdConfig`), so this is a
 * factory: `createSlskdProvider(config)`. slskd is the one downloader that
 * does both units — `acquisition.album` and `acquisition.track`.
 */
import SlskdIcon from '@assets/images/slskd.png';
import { downloadAlbum, downloadTrack, testConnection as testSlskdConnection, type SlskdConfig } from '@/api/slskd';
import type { IntegrationProvider } from '../contracts/Provider';

export function createSlskdProvider(config: SlskdConfig): IntegrationProvider {
  return {
    kind: 'integration',
    id: 'slskd',
    presentation: { nameKey: 'settings.downloaders.slskd.title', icon: SlskdIcon },
    auth: { tier: 'apiKey', configKeys: ['serverUrl', 'apiKey'] },
    capabilities: {
      'acquisition.album': async request => {
        const result = await downloadAlbum(config, {
          title: request.title,
          artist: request.artist,
          mbid: request.externalIds.mbid ?? null,
        });
        return result.success
          ? { accepted: true }
          : { accepted: false, message: result.message };
      },
      'acquisition.track': async request => {
        const result = await downloadTrack(config, { title: request.title, artist: request.artist });
        return result.success
          ? { accepted: true }
          : { accepted: false, message: result.message };
      },
    },
    testConnection: async () => {
      try {
        const ok = await testSlskdConnection(config);
        return { ok };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'slskd connection failed' };
      }
    },
  };
}
