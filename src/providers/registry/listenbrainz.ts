/**
 * ListenBrainz as an integration provider.
 *
 * `scrobble` needs the user's own username+token (`ListenBrainzConfig`), so
 * this is a factory rather than a plain object — `createListenBrainzProvider`
 * takes that config and closes over it. `similarity.artists` is a public,
 * MBID-keyed endpoint that needs no credential at all; it is declared inside
 * the same factory anyway, because one provider id means one declaration,
 * not two.
 */
import { getLBSimilarArtists, submitScrobble, testConnection as testListenBrainzConnection } from '@/providers/integration/listenbrainz';
import type { ListenBrainzConfig } from '@/types';
import { sourceColor } from '@/constants/design';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import type { Artist } from '@/domain/entities/Artist';
import type { IntegrationProvider } from '../contracts/Provider';

const PROVENANCE = integrationProvenance('listenbrainz');

export function createListenBrainzProvider(config: ListenBrainzConfig): IntegrationProvider {
  return {
    kind: 'integration',
    id: 'listenbrainz',
    // No dedicated icon asset exists for ListenBrainz today — see the file report.
    presentation: { nameKey: 'settings.listenBrainz.title', icon: 0, color: sourceColor.listenbrainz },
    auth: { tier: 'account', configKeys: ['username', 'token'] },
    capabilities: {
      'similarity.artists': async (artist, limit) => {
        const mbid = artist.externalIds.mbid;
        if (!mbid) return [];
        const raw = await getLBSimilarArtists(mbid, limit);
        // Same mapping `src/features/artist/useLBSimilarArtists.ts` already
        // does — ListenBrainz's similar-artists graph is keyed entirely on
        // MBID, which doubles as `nativeId` here.
        return raw.map((candidate): Artist => ({
          localId: makeLocalId('artist', PROVENANCE, candidate.artistMbid),
          nativeId: candidate.artistMbid,
          provenance: PROVENANCE,
          externalIds: { mbid: candidate.artistMbid },
          libraryState: 'external',
          name: candidate.name,
          cover: { kind: 'none' },
          tags: [],
          albumIds: [],
        }));
      },
      scrobble: async listen => {
        await submitScrobble(config, {
          artist: listen.song.artist.name,
          track: listen.song.title,
          listenedAt: Math.floor(listen.startedAt / 1000),
          durationSeconds: listen.song.durationSeconds || undefined,
          album: listen.song.album.title,
        });
      },
    },
    testConnection: async () => {
      const result = await testListenBrainzConnection(config);
      return { ok: result.success, message: result.message };
    },
  };
}
