import { RootState } from '@/state/redux/store';
import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import {
  DOWNLOADER_IDS,
  DownloaderConnection,
  DownloaderId,
  PerServerDownloadersState,
} from '@/state/redux/slices/downloadersSlice';
import { DEFAULT_SLSKD_PREFERENCES, type SlskdSearchPreferences } from '@/providers/integration/slskd';
import { getCredentials } from '@/state/credentialCache';
import type { CredentialScope } from '@/state/credentials';
import { selectCredentialsHydrated } from './serversSelectors';

const emptyConnection: DownloaderConnection = { serverUrl: '', isAuthenticated: false };

const defaultEntry: PerServerDownloadersState = {
  lidarr: emptyConnection,
  slskd: emptyConnection,
  soulsync: emptyConnection,
};

export const selectDownloadersForActiveServer = createSelector(
  [(s: RootState) => s.downloaders.byServer, (s: RootState) => s.servers.activeServerId],
  (byServer, activeServerId): PerServerDownloadersState =>
    (activeServerId ? byServer[activeServerId] ?? defaultEntry : defaultEntry)
);

/** Where one server's downloader API key lives in the keystore. */
export const downloaderCredentialScope = (id: DownloaderId, serverId: string): CredentialScope => ({
  kind: 'integration',
  providerId: `downloader:${id}:${serverId}`,
});

interface DownloaderSelectors {
  serverUrl: (s: RootState) => string;
  isAuthenticated: (s: RootState) => boolean;
  useApiKey: () => string;
  useConfig: () => { serverUrl: string; apiKey: string };
}

function buildSelectors(id: DownloaderId): DownloaderSelectors {
  const connection = createSelector(
    [selectDownloadersForActiveServer],
    (entry) => entry[id] ?? emptyConnection
  );
  const serverUrl = createSelector([connection], (c) => c.serverUrl);
  const isAuthenticated = createSelector([connection], (c) => c.isAuthenticated);
  function useApiKey(): string {
    const serverId = useSelector((s: RootState) => s.servers.activeServerId);
    useSelector(selectCredentialsHydrated);
    return serverId ? getCredentials(downloaderCredentialScope(id, serverId)).apiKey ?? '' : '';
  }
  function useConfig(): { serverUrl: string; apiKey: string } {
    const url = useSelector(serverUrl);
    const apiKey = useApiKey();
    return { serverUrl: url, apiKey };
  }
  return { serverUrl, isAuthenticated, useApiKey, useConfig };
}

export const downloaderSelectors = Object.fromEntries(
  DOWNLOADER_IDS.map((id) => [id, buildSelectors(id)])
) as Record<DownloaderId, DownloaderSelectors>;

export const selectLidarrAuthenticated = downloaderSelectors.lidarr.isAuthenticated;
export const selectSlskdAuthenticated = downloaderSelectors.slskd.isAuthenticated;
export const useLidarrConfig = downloaderSelectors.lidarr.useConfig;

const selectSlskdConnection = createSelector(
  [selectDownloadersForActiveServer],
  (entry) => entry.slskd ?? emptyConnection
);

/**
 * Merges the user's stored slskd preferences with the built-in defaults, so
 * a partially-saved value (e.g. only min bitrate set) still gets defaults for
 * the other fields. Unknown keys are dropped — this is user-controlled.
 */
export const selectSlskdPreferences = createSelector(
  [selectSlskdConnection],
  (connection): SlskdSearchPreferences => {
    const stored = connection.preferences as Partial<SlskdSearchPreferences> | undefined;
    return {
      preferredFormat: stored?.preferredFormat ?? DEFAULT_SLSKD_PREFERENCES.preferredFormat,
      minBitrateKbps: stored?.minBitrateKbps ?? DEFAULT_SLSKD_PREFERENCES.minBitrateKbps,
      preferFreeSlot: stored?.preferFreeSlot ?? DEFAULT_SLSKD_PREFERENCES.preferFreeSlot,
    };
  }
);

/**
 * The saved default acquisition provider for the active server, per unit.
 * Per-server rather than global: acquisition is already scoped to the
 * active server (its own downloader connections), so the default follows
 * the same scope. Undefined means "ask each time" — GetReviewSheet only
 * ever uses this to *preselect* a row, never to skip the Get confirm.
 */
export const selectDefaultProviderForActiveServer = createSelector(
  [(s: RootState) => s.downloaders.defaultsByServer, (s: RootState) => s.servers.activeServerId],
  (defaultsByServer, activeServerId) =>
    (activeServerId ? defaultsByServer[activeServerId] ?? {} : {})
);

/**
 * The saved default Lidarr quality profile id for the active server.
 * Undefined means Lidarr applies its own default (profile id 1) — see
 * `ensureArtist`'s fallback.
 */
export const selectLidarrDefaultQualityProfileId = createSelector(
  [selectDefaultProviderForActiveServer],
  (defaults) => defaults.lidarrDefaultQualityProfileId
);
