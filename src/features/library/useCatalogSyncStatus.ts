/**
 * Whether a catalog sync is running, asked of the QueryClient.
 *
 * The client already tracks every in-flight mutation and shares that across
 * every hook instance. The previous implementation kept its own
 * `activeSyncServerId` module variable and a `Set` of listeners to broadcast
 * changes — a second store for a fact something else already owned, and the
 * kind of hand-rolled observable this rewrite exists to remove.
 */
import { useIsMutating } from '@tanstack/react-query';
import { catalogSyncKey } from './catalogQueries';

export function useCatalogSyncStatus(serverId: string | undefined): { isSyncing: boolean } {
  const running = useIsMutating({
    mutationKey: serverId ? catalogSyncKey(serverId) : ['catalog-sync', '__none__'],
  });
  return { isSyncing: serverId ? running > 0 : false };
}
