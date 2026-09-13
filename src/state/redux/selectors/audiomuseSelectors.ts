import { RootState } from '@/state/redux/store';
import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { AudiomuseConnection } from '@/state/redux/slices/audiomuseSlice';
import { getCredentials } from '@/state/credentialCache';
import type { CredentialScope } from '@/state/credentials';
import { selectCredentialsHydrated } from './serversSelectors';

const emptyConnection: AudiomuseConnection = {
  serverUrl: '',
  isEnabled: false,
  isAuthenticated: false,
};

export const selectAudiomuseForActiveServer = createSelector(
  [(s: RootState) => s.audiomuse.byServer, (s: RootState) => s.servers.activeServerId],
  (byServer, activeServerId): AudiomuseConnection =>
    (activeServerId ? byServer[activeServerId] ?? emptyConnection : emptyConnection)
);

export const selectAudiomuseServerUrl = createSelector(
  [selectAudiomuseForActiveServer],
  (c) => c.serverUrl
);
export const selectAudiomuseEnabled = createSelector(
  [selectAudiomuseForActiveServer],
  (c) => c.isEnabled
);
export const selectAudiomuseAuthenticated = createSelector(
  [selectAudiomuseForActiveServer],
  (c) => c.isAuthenticated
);

/** Where one server's AudioMuse-AI API token lives in the keystore. */
export const audiomuseCredentialScope = (serverId: string): CredentialScope => ({
  kind: 'integration',
  providerId: `audiomuse:${serverId}`,
});

/** The token, read from `credentialCache` — see the note on `useListenBrainzToken`. */
export function useAudiomuseApiToken(): string {
  const serverId = useSelector((s: RootState) => s.servers.activeServerId);
  useSelector(selectCredentialsHydrated);
  return serverId ? getCredentials(audiomuseCredentialScope(serverId)).apiKey ?? '' : '';
}

export function useAudiomuseConfig(): { serverUrl: string; apiToken: string } {
  const serverUrl = useSelector(selectAudiomuseServerUrl);
  const apiToken = useAudiomuseApiToken();
  return { serverUrl, apiToken };
}

// The gate Smart Shuffle tiering and Smooth Transitions check before using AudioMuse-AI.
export function useIsAudiomuseConfigured(): boolean {
  const { serverUrl, apiToken } = useAudiomuseConfig();
  const isEnabled = useSelector(selectAudiomuseEnabled);
  const isAuthenticated = useSelector(selectAudiomuseAuthenticated);
  return Boolean(serverUrl && apiToken && isEnabled && isAuthenticated);
}
