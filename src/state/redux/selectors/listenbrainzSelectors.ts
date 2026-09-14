import { RootState } from '@/state/redux/store';
import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { PerServerListenBrainzState } from '@/state/redux/slices/listenbrainzSlice';
import { getCredentials } from '@/state/credentialCache';
import type { CredentialScope } from '@/state/credentials';
import { selectCredentialsHydrated } from './serversSelectors';

const defaultEntry: PerServerListenBrainzState = {
  username: '',
  isAuthenticated: false,
  scrobbleEnabled: true,
};

const selectListenBrainzForActiveServer = createSelector(
  [(s: RootState) => s.listenbrainz.byServer, (s: RootState) => s.servers.activeServerId],
  (byServer, activeServerId): PerServerListenBrainzState =>
    (activeServerId ? byServer[activeServerId] ?? defaultEntry : defaultEntry)
);

export const selectListenBrainzUsername = createSelector(
  [selectListenBrainzForActiveServer],
  (entry) => entry.username
);

export const selectListenBrainzAuthenticated = createSelector(
  [selectListenBrainzForActiveServer],
  (entry) => entry.isAuthenticated
);

/** Where one server's ListenBrainz user token lives in the keystore. */
export const listenBrainzCredentialScope = (serverId: string): CredentialScope => ({
  kind: 'integration',
  providerId: `listenbrainz:${serverId}`,
});

/**
 * The token, read from `credentialCache` rather than Redux — not a selector
 * over `RootState` because the secret isn't in it. Still a hook: it needs
 * `activeServerId` (to know which scope to read) and subscribes to
 * `credentialsHydrated` purely so it re-renders once the startup keystore
 * read actually lands.
 */
export function useListenBrainzToken(): string {
  const serverId = useSelector((s: RootState) => s.servers.activeServerId);
  useSelector(selectCredentialsHydrated);
  return serverId ? getCredentials(listenBrainzCredentialScope(serverId)).token ?? '' : '';
}

/** Same lever as scrobble — see the note in settingsSelectors. */
export function useListenBrainzConfig(): { username: string; token: string } | null {
  const username = useSelector(selectListenBrainzUsername);
  const token = useListenBrainzToken();
  return username && token ? { username, token } : null;
}
