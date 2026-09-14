/**
 * The five server providers, re-expressed against the `Capabilities`
 * contract.
 *
 * A server is required core (exactly one is active), so unlike an
 * integration it is not declared as a static object — it is built from the
 * `ApiAdapter` already constructed for the active `Server` (see
 * `src/providers/registry/serverConnections.ts#createAdapter`). That adapter is the
 * "client" every capability here needs, so each factory takes it as its one
 * dependency rather than reaching into a React store.
 *
 * Only capabilities an `ApiAdapter` member actually guarantees are declared:
 *
 * - `lyrics` and `similarity.songs` come from `ApiAdapter.lyrics` and
 *   `ApiAdapter.similar.getSimilarSongs`, both required members of the
 *   adapter shape (`src/providers/contracts/ServerAdapter.ts`) — every server has them, even where
 *   the implementation always answers empty/null (Plex, Local).
 * - `scrobble` comes from the required `ApiAdapter.songs.scrobble`.
 * - `similarity.artists` comes from the *optional*
 *   `ApiAdapter.similar.getSimilarArtists`. Navidrome, Jellyfin and Emby
 *   implement it; Plex and Local do not, so those two factories leave the
 *   capability off entirely rather than reflectively probing for it the way
 *   `serverAdapterSlots` used to — the presence or absence is read once here,
 *   at declaration time, per server.
 *
 * `discovery.shelf` and `catalogue.album` are deliberately NOT declared for
 * any server — see the file-level report for why.
 */
import NavidromeIcon from '@assets/images/navidrome.png';
import JellyfinIcon from '@assets/images/jellyfin.png';
import EmbyIcon from '@assets/images/emby.png';
import PlexIcon from '@assets/images/plex.png';
import LocalFilesIcon from '@assets/images/local-files.png';

import type { ApiAdapter } from '@/providers/contracts/ServerAdapter';
import type { Capabilities } from '../contracts/Capabilities';
import type { ServerProvider } from '../contracts/Provider';

/** Capabilities every server declares, built from members `ApiAdapter` requires. */
function coreServerCapabilities(api: ApiAdapter): Capabilities {
  return {
    lyrics: async song => {
      const result = await api.lyrics.getBySongId(song.nativeId);
      return result ? { lines: result.lines, synced: result.synced } : null;
    },
    'similarity.songs': async (song, limit) => {
      const similar = await api.similar.getSimilarSongs(song.nativeId);
      return similar.slice(0, limit);
    },
    scrobble: async listen => {
      await api.songs.scrobble(listen.song.nativeId, listen.startedAt);
    },
  };
}

/** Adds `similarity.artists` only when this server's adapter actually implements it. */
function withOptionalSimilarArtists(api: ApiAdapter, capabilities: Capabilities): Capabilities {
  const getSimilarArtists = api.similar.getSimilarArtists;
  if (typeof getSimilarArtists !== 'function') return capabilities;
  return {
    ...capabilities,
    'similarity.artists': async (artist, limit) => getSimilarArtists(artist.nativeId, limit),
  };
}

function serverProvider(
  id: string,
  nameKey: string,
  icon: number,
  authTier: 'account' | 'none',
  api: ApiAdapter
): ServerProvider {
  return {
    kind: 'server',
    id,
    presentation: { nameKey, icon },
    // Every server authenticates with the credentials already resolved into
    // `api` by `createAdapter` (see `src/providers/registry/serverConnections.ts`); this
    // declaration answers "what can it do", not "how do I log in" — that
    // stays the onboarding flow's job. Local files need no account at all.
    auth: { tier: authTier },
    capabilities: withOptionalSimilarArtists(api, coreServerCapabilities(api)),
    testConnection: async () => ({ ok: await api.auth.ping() }),
  };
}

export const createNavidromeProvider = (api: ApiAdapter): ServerProvider =>
  serverProvider('navidrome', 'settings.library.downloads.provider.navidrome', NavidromeIcon, 'account', api);

export const createJellyfinProvider = (api: ApiAdapter): ServerProvider =>
  serverProvider('jellyfin', 'settings.library.downloads.provider.jellyfin', JellyfinIcon, 'account', api);

export const createEmbyProvider = (api: ApiAdapter): ServerProvider =>
  serverProvider('emby', 'settings.library.downloads.provider.emby', EmbyIcon, 'account', api);

// No existing i18n key holds "Plex" alone (checked: `settings.library.downloads.provider`
// only carries navidrome/jellyfin/emby). Rather than invent one, this points at
// the same "no key for this name yet" gap called out in the file report.
export const createPlexProvider = (api: ApiAdapter): ServerProvider =>
  serverProvider('plex', 'settings.library.downloads.provider.plex', PlexIcon, 'account', api);

export const createLocalProvider = (api: ApiAdapter): ServerProvider =>
  serverProvider('local', 'settings.library.localFiles.title', LocalFilesIcon, 'none', api);
