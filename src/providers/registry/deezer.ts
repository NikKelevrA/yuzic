/**
 * Deezer as an integration provider.
 *
 * Keyless public API (`auth: { tier: 'none' }`), same as the source registry
 * it replaces — no client to inject, so this is a plain declaration rather
 * than a factory. Every capability below calls straight into the existing
 * `src/providers/integration/deezer` functions; nothing here talks to the
 * network itself.
 */
import {
  searchDeezerArtists,
  searchDeezerAlbums,
  getDeezerAlbum,
} from '@/providers/integration/deezer';
import { sourceColor } from '@/constants/design';
import type { IntegrationProvider } from '../contracts/Provider';

export const deezerProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'deezer',
  // No dedicated icon asset exists for Deezer today (checked assets/images —
  // only server logos and lidarr/slskd are there). `icon: 0` is the same
  // placeholder the contract's own broker test uses for a provider with no
  // real asset, rather than inventing one.
  presentation: { nameKey: 'settings.sources.deezer.name', icon: 0, color: sourceColor.deezer },
  auth: { tier: 'none' },
  // Its pictures fill gaps through `coverBackups.ts`, not a capability here.
  capabilities: {
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
        // Deezer's own search API can do this; nothing here has asked for it
        // yet, so it stays unimplemented rather than half-built. `kinds.songs`
        // is safe to ignore — see `CatalogueSearchKinds`'s own note.
        songs: [],
      };
    },
    'catalogue.album': async nativeId => getDeezerAlbum(nativeId),
  },
  // Keyless public API, reachable by construction — matches
  // `trivialTestConnection` in the source registry this replaces.
  testConnection: async () => ({ ok: true }),
};
