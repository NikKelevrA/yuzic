import { RootState } from '@/state/redux/store';
import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { PlaylistImportConnection } from '@/state/redux/slices/playlistImportSlice';

const emptyConnection: PlaylistImportConnection = {
  serverUrl: '',
  isEnabled: false,
  isAuthenticated: false,
  attempted: {},
};

const selectPlaylistImportForActiveServer = createSelector(
  [(s: RootState) => s.playlistImport.byServer, (s: RootState) => s.servers.activeServerId],
  (byServer, activeServerId): PlaylistImportConnection =>
    (activeServerId ? byServer[activeServerId] ?? emptyConnection : emptyConnection)
);

export const selectPlaylistImportServerUrl = createSelector(
  [selectPlaylistImportForActiveServer],
  (c) => c.serverUrl
);
export const selectPlaylistImportEnabled = createSelector(
  [selectPlaylistImportForActiveServer],
  (c) => c.isEnabled
);
export const selectPlaylistImportAuthenticated = createSelector(
  [selectPlaylistImportForActiveServer],
  (c) => c.isAuthenticated
);
export const selectPlaylistImportAttempted = createSelector(
  [selectPlaylistImportForActiveServer],
  (c) => c.attempted
);

/** The gate `usePlaylistImportSync` checks before polling at all. */
export function useIsPlaylistImportConfigured(): boolean {
  const serverUrl = useSelector(selectPlaylistImportServerUrl);
  const isEnabled = useSelector(selectPlaylistImportEnabled);
  const isAuthenticated = useSelector(selectPlaylistImportAuthenticated);
  return Boolean(serverUrl && isEnabled && isAuthenticated);
}
