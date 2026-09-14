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
import { mapAlbum as mapMbAlbum } from '@/providers/integration/musicbrainz/mapAlbum';
import { mapArtist as mapMbArtist } from '@/providers/integration/musicbrainz/mapArtist';
import { mapSong as mapMbSong } from '@/providers/integration/musicbrainz/mapSong';
import { sourceColor } from '@/constants/design';
import { integrationProvenance } from '@/domain/identity/Provenance';
import type { IntegrationProvider } from '../contracts/Provider';

const MB_PROVENANCE = integrationProvenance('musicbrainz');

export const musicbrainzProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'musicbrainz',
  // No dedicated icon asset exists for MusicBrainz today — see the file
  // report. `icon: 0` matches the broker test's own placeholder convention
  // rather than inventing an asset.
  presentation: { nameKey: 'settings.search.musicbrainz', icon: 0, color: sourceColor.musicbrainz },
  auth: { tier: 'none' },
  capabilities: {
    'catalogue.search': async (query, kinds) => {
      const [artists, releaseGroups] = await Promise.all([
        kinds.artists ? mb.searchArtist(query, 4) : Promise.resolve([]),
        kinds.albums ? mb.searchReleaseGroupByTitle(query, 6) : Promise.resolve([]),
      ]);
      return {
        // MusicBrainz names no second line for an artist; for a release group
        // it is the first release year, which is this catalogue's own idea of
        // what distinguishes two records with the same title.
        artists: artists.map(dto => ({ entity: mapMbArtist(dto, MB_PROVENANCE), subtitle: '' })),
        albums: releaseGroups.map(dto => ({
          entity: mapMbAlbum(dto, { provenance: MB_PROVENANCE }),
          subtitle: dto['first-release-date']?.slice(0, 4) ?? '',
        })),
      };
    },
    'artist.enrich': async artist => {
      const results = await mb.searchArtist(artist.name, 1);
      const best = results[0];
      if (!best) return null;
      const biography = best.annotation?.trim();
      return {
        biography: biography || undefined,
        externalIds: { mbid: best.id },
      };
    },
    'album.enrich': async album => {
      const results = await mb.searchReleaseGroup(album.artist.name, album.title, 1);
      const best = results[0];
      if (!best) return null;
      return {
        cover: { kind: 'coverartarchive', mbid: best.id, mbidType: 'release-group' },
        externalIds: { mbid: best.id, mbidType: 'release-group' },
      };
    },
    'catalogue.album': async nativeId => {
      const rg = await mb.getReleaseGroup(nativeId);
      const tracks = await mb.getTracksForReleaseGroup(nativeId);
      const songs = tracks.map(track => mapMbSong(track, { provenance: MB_PROVENANCE, releaseGroup: rg }));
      const album = mapMbAlbum(rg, { provenance: MB_PROVENANCE, songIds: songs.map(s => s.localId) });
      return { album, songs };
    },
  },
  testConnection: async () => ({ ok: true }),
};
