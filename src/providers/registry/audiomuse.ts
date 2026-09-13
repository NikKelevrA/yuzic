/**
 * AudioMuse-AI as an ordinary integration provider.
 *
 * The registry this replaces special-cased AudioMuse, assembling its abilities
 * by hand because it never adopted the shared contract. There is no special
 * case here: it declares `similarity.songs` and `playlist.generate` exactly
 * like any other provider that has them.
 *
 * Both capabilities need the AudioMuse client's own config (server URL +
 * token) *and* the active server's `ApiAdapter` — similarity results come
 * back as AudioMuse's own item ids, which have to be resolved through the
 * server (`api.songs.get`) into real `Song` entities, and `playlist.generate`
 * has to create the playlist and add songs on that same server. So the
 * factory takes both.
 */
import { createAudiomuseClient, type AudiomuseConfig } from '@/api/audiomuse/client';
import { getAudiomuseQueueExtension } from '@/api/audiomuse/similarity';
import { testConnection as testAudiomuseConnection } from '@/api/audiomuse/ping';
import type { ApiAdapter } from '@/api/types';
import type { Song } from '@/domain/entities/Song';
import { sourceColor } from '@/constants/design';
import type { IntegrationProvider } from '../contracts/Provider';

export interface AudiomuseProviderDeps {
  config: AudiomuseConfig;
  api: ApiAdapter;
}

/**
 * Resolves AudioMuse's similarity refs (the active server's own item ids)
 * into real `Song` entities, dropping any the server no longer has — same
 * pattern `src/contexts/queueProviders.ts#createAudiomuseQueueFillProvider`
 * already uses for the queue-extension gesture.
 */
async function resolveTrackRefs(api: ApiAdapter, itemIds: string[]): Promise<Song[]> {
  const resolved = await Promise.allSettled(itemIds.map(id => api.songs.get(id)));
  return resolved
    .filter((r): r is PromiseFulfilledResult<Song | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((s): s is Song => s !== null);
}

export function createAudiomuseProvider(deps: AudiomuseProviderDeps): IntegrationProvider {
  const { config, api } = deps;

  return {
    kind: 'integration',
    id: 'audiomuse',
    // No dedicated icon asset exists for AudioMuse-AI today — see the file report.
    presentation: { nameKey: 'settings.audiomuse.title', icon: 0, color: sourceColor.audiomuse },
    auth: { tier: 'apiKey', configKeys: ['serverUrl', 'apiToken'] },
    capabilities: {
      'similarity.songs': async (song, limit) => {
        const client = createAudiomuseClient(config);
        const refs = await getAudiomuseQueueExtension(client, {
          seedItemIds: [song.nativeId],
          excludeItemIds: [song.nativeId],
          limit,
        });
        return resolveTrackRefs(api, refs.map(ref => ref.itemId));
      },
      'playlist.generate': async (seed, size) => {
        const client = createAudiomuseClient(config);
        const similar = await getAudiomuseQueueExtension(client, {
          seedItemIds: [seed.nativeId],
          excludeItemIds: [seed.nativeId],
          limit: size,
        });
        const trackIds = [
          seed.nativeId,
          ...similar.map(t => t.itemId).filter(id => id && id !== seed.nativeId),
        ];
        const playlistId = await api.playlists.create(`Similar to ${seed.title}`);
        for (const id of trackIds) {
          try {
            await api.playlists.addSong(playlistId, id);
          } catch {
            // A track AudioMuse knows about might not be in the user's own
            // library — skip it, same as
            // `src/features/audiomuse/generatePlaylist.ts` already does.
          }
        }
        return playlistId;
      },
    },
    testConnection: async () => {
      try {
        await testAudiomuseConnection(config);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : 'AudioMuse-AI connection failed' };
      }
    },
  };
}
