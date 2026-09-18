import JellyfinIcon from '@assets/images/jellyfin.png';

import { createJellyfinClient } from '@/providers/server/media-browser/jellyfin/client';
import { createJellyfinAdapter } from '@/providers/server/media-browser/jellyfin';
import {
  initiateQuickConnect,
  pollQuickConnect,
  authenticateWithQuickConnect,
} from '@/providers/server/media-browser/jellyfin/auth/quickConnect';
import { getMusicLibraries } from '@/providers/server/media-browser/auth/getMusicLibraries';
import { ping as pingMediaBrowser } from '@/providers/server/media-browser/auth/ping';
import { connect as connectMediaBrowser } from '@/providers/server/media-browser/auth/connect';
import { JELLYFIN_BRAND } from '@/providers/server/media-browser/brand';
import { probeAddress as probeMediaBrowserAddress } from '@/providers/server/media-browser/auth/probeAddress';
import type { ServerProviderConfig } from '@/providers/registry/serverProviderTypes';
import i18n from '@/i18n';

export const jellyfinProvider: ServerProviderConfig = {
  type: 'jellyfin',
  label: 'Jellyfin',
  get description() { return i18n.t('onboarding.connect.providerDescription.jellyfin'); },
  icon: { kind: 'image', source: JellyfinIcon },
  capabilities: {
    supportsDemo: false,
  },
  libraryScope: { key: 'parentIds', legacyKey: 'parentId' },
  listLibraries: (server) => getMusicLibraries(server),
  probeAddress: (url) => probeMediaBrowserAddress(JELLYFIN_BRAND, url),
  ping: async (url, username, auth, basicAuth) => {
    const token = auth.token as string;
    const userId = auth.userId as string;
    if (!token || !userId) return false;
    const client = createJellyfinClient({ serverUrl: url, token, userId, basicAuth });
    return pingMediaBrowser(client);
  },
  connect: async (url, username, password, basicAuth) => {
    const result = await connectMediaBrowser(JELLYFIN_BRAND, url, username, password, basicAuth);
    if (!result.success) {
      return {
        success: false,
        message: result.message,
      };
    }
    return {
      success: true,
      auth: {
        password,
        token: result.token,
        userId: result.userId,
      },
    };
  },
  createAdapter: (server) => createJellyfinAdapter(server),
  codeAuth: {
    begin: async ({ serverUrl, basicAuth }) => {
      const { secret, code } = await initiateQuickConnect(serverUrl, basicAuth);
      return { code, handle: secret };
    },
    poll: async ({ serverUrl, handle, basicAuth }) => {
      const secret = handle as string;
      const authenticated = await pollQuickConnect(serverUrl, secret, basicAuth);
      if (!authenticated) return null;

      const { token, userId, username } = await authenticateWithQuickConnect(
        serverUrl,
        secret,
        basicAuth
      );
      return { auth: { token, userId }, username };
    },
    pollIntervalMs: 3000,
    timeoutMs: 10 * 60 * 1000,
    instructionKey: 'onboarding.credentials.codeAuth.jellyfin.instruction',
    actionKey: 'onboarding.credentials.codeAuth.jellyfin.action',
  },
  buildCoverUrl: (server, cover, px) => {
    if (cover.kind !== 'jellyfin') return null;
    const token = server.auth?.token as string | undefined;
    if (!server.serverUrl || !token) return null;
    // `ApiKey`, not `X-Emby-Token`: the latter is not a query parameter
    // Jellyfin reads on any version, and `api_key` is gated behind 12's
    // legacy-authorization switch. See `MediaBrowserBrand.streamTokenParam`.
    const params = new URLSearchParams({ quality: '90', maxWidth: String(px), maxHeight: String(px), ApiKey: token });
    return `${server.serverUrl}/Items/${cover.itemId}/Images/Primary?${params}`;
  },
};
