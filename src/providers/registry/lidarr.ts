/**
 * Lidarr as an integration provider.
 *
 * Needs the user's own server URL + API key (`LidarrConfig`), so this is a
 * factory: `createLidarrProvider(config)`.
 *
 * `acquisition.album` only — Lidarr is album-oriented and has no
 * track-level endpoint, matching `src/features/downloaders/registry.ts`'s
 * own comment ("Lidarr is album-only — no `acquisition.track` slot").
 *
 * `AcquisitionRequest` carries less than `LidarrAlbumRequest` wants
 * (`releaseDate`/`releaseType` and the *artist's own* mbid/Deezer id aren't
 * part of it — see the file report). Those fields are optional tie-breakers
 * in Lidarr's own artist/album resolution, not requirements, so this maps
 * what the capability does carry (title, artist name, the album's own mbid
 * and Deezer id) and leaves the rest for Lidarr's existing by-name fallback.
 */
import LidarrIcon from '@assets/images/lidarr.png';
import { downloadAlbum, testConnection as testLidarrConnection } from '@/providers/integration/lidarr';
import type { LidarrConfig } from '@/types';
import type { IntegrationProvider } from '../contracts/Provider';

export function createLidarrProvider(config: LidarrConfig): IntegrationProvider {
  return {
    kind: 'integration',
    id: 'lidarr',
    presentation: { nameKey: 'settings.downloaders.lidarr.title', icon: LidarrIcon },
    auth: { tier: 'apiKey', configKeys: ['serverUrl', 'apiKey'] },
    capabilities: {
      'acquisition.album': async request => {
        const result = await downloadAlbum(config, {
          albumTitle: request.title,
          artistName: request.artist,
          albumMbid: request.externalIds.mbid ?? null,
          albumDeezerId: request.externalIds.deezerId,
        });
        return result.success
          ? { accepted: true, message: result.message }
          : { accepted: false, message: result.message };
      },
    },
    testConnection: async () => {
      try {
        const ok = await testLidarrConnection(config);
        return { ok: Boolean(ok) };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'Lidarr connection failed' };
      }
    },
  };
}
