import { createSelector } from '@reduxjs/toolkit';
import { Server } from '@/providers/contracts/Server';
import { RootState } from '@/state/redux/store';

export const selectActiveServerId = (state: RootState) => state.servers.activeServerId;

/** See `ServersState.credentialsHydrated` — subscribe to this to re-render once the startup keystore read lands. */
export const selectCredentialsHydrated = (state: RootState) => state.servers.credentialsHydrated;

export const selectActiveServer = createSelector(
  (state: RootState) => state.servers.servers,
  selectActiveServerId,
  (servers, activeServerId) => {
    if (!servers || !activeServerId) return null;
    return servers.find(s => s.id === activeServerId) ?? null;
  }
);

export const selectServerById =
  (id: string) =>
  (state: RootState): Server | null =>
    state.servers.servers.find(s => s.id === id) ?? null;
