/**
 * MusicBrainz as an integration provider.
 *
 * Keyless public API, same as Deezer — a plain declaration, no factory. Every
 * capability calls into the existing `src/providers/integration/musicbrainz`
 * functions and
 * mappers, reusing the exact calls `src/features/sources/registry.ts`'s
 * `musicbrainzSource` already made for the same job.
 */
import * as mb from '@/providers/integration/musicbrainz';
import type { MusicbrainzClient } from '@/providers/integration/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { mapArtist as mapMbArtist } from '@/providers/integration/musicbrainz/mapArtist';
import { mapSong as mapMbSong } from '@/providers/integration/musicbrainz/mapSong';
import { sourceColor } from '@/constants/design';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { selectSourceFallbackUrls, selectSourceServerUrls } from '@/features/settings/sources/state';
import store from '@/state/redux/store';
import type { IntegrationProvider } from '../contracts/Provider';

const MB_PROVENANCE = integrationProvenance('musicbrainz');

/**
 * The client for the server the user has chosen: their own when they have set
 * an address for it, the shared public one otherwise.
 *
 * Read at the moment of the call, so a change in Settings applies to the next
 * request without anything being rebuilt. The address is handed to the client
 * as its config; the integration itself never sees the store. A client for a
 * server of your own holds no state (it has no limiter to share), so making
 * one per call costs nothing, while the public one stays the single shared
 * client whose limiter every call must queue behind.
 */
export function currentMusicbrainzClient(): MusicbrainzClient {
  const state = store.getState();
  const serverUrl = selectSourceServerUrls(state).musicbrainz;
  const fallback = selectSourceFallbackUrls(state).musicbrainz?.trim();
  return serverUrl?.trim()
    ? mb.createMusicbrainzClient({ serverUrl, fallbackUrls: fallback ? [fallback] : undefined })
    : mb;
}

/**
 * Whether a server answers like a MusicBrainz one, asked with the same client
 * the app will use for it — so an address that passes here is one the search
 * will actually work against, `/ws/2` handling and all.
 */
export async function musicbrainzServerAnswers(serverUrl: string): Promise<boolean> {
  try {
    await mb.createMusicbrainzClient({ serverUrl }).searchArtist('a', 1);
    return true;
  } catch {
    return false;
  }
}

export const musicbrainzProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'musicbrainz',
  // No dedicated icon asset exists for MusicBrainz today — see the file
  // report. `icon: 0` matches the broker test's own placeholder convention
  // rather than inventing an asset.
  presentation: { nameKey: 'settings.sources.musicbrainz.name', icon: 0, color: sourceColor.musicbrainz },
  auth: { tier: 'none' },
  capabilities: {
    'catalogue.search': async (query, kinds) => {
      const [artists, releaseGroups] = await Promise.all([
        kinds.artists ? currentMusicbrainzClient().searchArtist(query, 4) : Promise.resolve([]),
        kinds.albums ? currentMusicbrainzClient().searchReleaseGroupByTitle(query, 6) : Promise.resolve([]),
      ]);
      return {
        // MusicBrainz names no second line for an artist; for a release group
        // it is the first release year, which is this catalogue's own idea of
        // what distinguishes two records with the same title.
        artists: artists.map(dto => ({ entity: mapMbArtist(dto, MB_PROVENANCE), subtitle: '' })),
        albums: releaseGroups.map(dto => {
          const year = dto['first-release-date']?.slice(0, 4) ?? '';
          const artistName = dto['artist-credit']
            ?.map(credit => credit.name ?? credit.artist.name)
            .join(', ');
          // The row names the artist as well as the year: two records with
          // one title are told apart by who made them. The artist rides on
          // separately so a lookup never mistakes "Artist · 2001" for a name.
          return {
            entity: mapMbAlbum(dto, { provenance: MB_PROVENANCE }),
            subtitle: artistName ? (year ? `${artistName} · ${year}` : artistName) : year,
            artistName: artistName || undefined,
          };
        }),
      };
    },
    'catalogue.album': async nativeId => {
      const client = currentMusicbrainzClient();
      const rg = await client.getReleaseGroup(nativeId);
      const tracks = await client.getTracksForReleaseGroup(nativeId);
      const songs = tracks.map(track => mapMbSong(track, { provenance: MB_PROVENANCE, releaseGroup: rg }));
      const album = mapMbAlbum(rg, { provenance: MB_PROVENANCE, songIds: songs.map(s => s.localId) });
      return { album, songs };
    },
  },
  testConnection: async () => ({ ok: true }),
};
