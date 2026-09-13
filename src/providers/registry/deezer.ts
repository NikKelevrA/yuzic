/**
 * Deezer as an integration provider.
 *
 * Keyless public API (`auth: { tier: 'none' }`), same as the source registry
 * it replaces — no client to inject, so this is a plain declaration rather
 * than a factory. Every capability below calls straight into the existing
 * `src/api/deezer` functions; nothing here talks to the network itself.
 */
import {
  searchDeezerArtists,
  searchDeezerAlbums,
  getDeezerAlbum,
  getDeezerArtist,
  getDeezerChartAlbums,
  getDeezerRelatedArtists,
  resolveDeezerAlbum,
  resolveDeezerArtistByName,
} from '@/api/deezer';
import { sourceColor } from '@/constants/design';
import type { IntegrationProvider } from '../contracts/Provider';

export const deezerProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'deezer',
  // No dedicated icon asset exists for Deezer today (checked assets/images —
  // only server logos and lidarr/slskd are there). `icon: 0` is the same
  // placeholder the contract's own broker test uses for a provider with no
  // real asset, rather than inventing one.
  presentation: { nameKey: 'settings.search.deezer', icon: 0, color: sourceColor.deezer },
  auth: { tier: 'none' },
  capabilities: {
    'artist.enrich': async artist => {
      const resolved = await resolveDeezerArtistByName(artist.name);
      if (!resolved) return null;
      const full = await getDeezerArtist(resolved.nativeId);
      if (!full) return null;
      return { cover: full.cover, externalIds: full.externalIds };
    },
    'album.enrich': async album => {
      const resolved = await resolveDeezerAlbum(album.artist.name, album.title);
      if (!resolved) return null;
      return { cover: resolved.cover, externalIds: resolved.externalIds };
    },
    'catalogue.search': async (query, kinds) => {
      const [artists, albums] = await Promise.all([
        kinds.artists ? searchDeezerArtists(query, 4) : Promise.resolve([]),
        kinds.albums ? searchDeezerAlbums(query, 6) : Promise.resolve([]),
      ]);
      return {
        // Deezer has no second line worth showing for an artist, and an
        // album's is its artist. Both are this catalogue's own choice.
        artists: artists.map(entity => ({ entity, subtitle: '' })),
        albums: albums.map(entity => ({ entity, subtitle: entity.artist.name })),
      };
    },
    'similarity.artists': async (artist, limit) => {
      const resolved = await resolveDeezerArtistByName(artist.name);
      if (!resolved) return [];
      return getDeezerRelatedArtists(resolved.nativeId, limit);
    },
    'discovery.shelf': async () => ({
      titleKey: 'explore.sections.charts',
      albums: await getDeezerChartAlbums(20),
    }),
    'catalogue.album': async nativeId => getDeezerAlbum(nativeId),
  },
  // Keyless public API, reachable by construction — matches
  // `trivialTestConnection` in the source registry this replaces.
  testConnection: async () => ({ ok: true }),
};
