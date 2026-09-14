import type { Server, ServerType } from '@/providers/contracts/Server';
import type { Library } from '@/providers/contracts/ServerAdapter';
import { withServerCredentials } from './serverCredentials';
import type { ServerProviderConfig } from './serverProviderTypes';
import { embyProvider } from './servers/emby';
import { jellyfinProvider } from './servers/jellyfin';
import { localProvider } from './servers/local';
import { navidromeProvider } from './servers/navidrome';
import { plexProvider } from './servers/plex';

export type { Library };

/**
 * Every music server type the app can connect to, each declared in its own
 * file under `servers/`. Screens and the adapter layer look a type up here
 * and use what it declares — how to connect, sign in by code, list libraries,
 * build a cover URL — rather than branching on its name.
 *
 * Secrets are handled in `serverCredentials.ts`; the declaration shape is in
 * `serverProviderTypes.ts`.
 */
export const SERVER_PROVIDERS: Record<ServerType, ServerProviderConfig> = {
  navidrome: navidromeProvider,
  jellyfin: jellyfinProvider,
  plex: plexProvider,
  emby: embyProvider,
  local: localProvider,
};

export const getServerProvider = (type: ServerType) => {
  const provider = SERVER_PROVIDERS[type];
  if (!provider) {
    throw new Error(`Unknown server provider: ${type}`);
  }
  return provider;
};

/** The libraries this server offers, asked of it without knowing its type. */
export const listServerLibraries = (server: Server): Promise<Library[]> =>
  getServerProvider(server.type).listLibraries(withServerCredentials(server));

/**
 * The library ids currently selected, empty meaning "all". Reads the provider's
 * own key, falling back to the pre-multi-select singular one so a server
 * configured before that change keeps its scope.
 */
export const selectedLibraryIds = (server: Server): string[] => {
  const { key, legacyKey } = getServerProvider(server.type).libraryScope;
  const current = server.auth?.[key];
  if (Array.isArray(current)) return current as string[];
  const legacy = server.auth?.[legacyKey];
  return legacy ? [String(legacy)] : [];
};

/** The `auth` patch that stores a new selection for this server. */
export const libraryScopePatch = (
  server: Server,
  ids: string[]
): Record<string, string[]> => ({
  [getServerProvider(server.type).libraryScope.key]: ids,
});
