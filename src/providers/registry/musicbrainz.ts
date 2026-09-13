/**
 * MusicBrainz as an integration provider.
 *
 * Keyless public API, same as Deezer — a plain declaration, no factory. Every
 * capability calls into the existing `src/api/musicbrainz` functions and
 * mappers, reusing the exact calls `src/features/sources/registry.ts`'s
 * `musicbrainzSource` already made for the same job.
 */
import * as mb from '@/api/musicbrainz';
import { mapAlbum as mapMbAlbum } from '@/api/musicbrainz/mapAlbum';
import { mapSong as mapMbSong } from '@/api/musicbrainz/mapSong';
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
