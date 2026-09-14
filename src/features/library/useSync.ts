/**
 * Refreshing the catalog from the active server.
 *
 * A thin coordinator over `runCatalogSync`. It owns only the decisions that
 * need React and the store — is there a connected server, has enough time
 * passed, what does the result get dispatched to — while the run itself is a
 * pure function and the "is a sync happening" fact belongs to the QueryClient.
 *
 * It used to own all three, through a module-level `activeSyncServerId` and a
 * `Set` of listeners that every hook instance subscribed to. The mutation key
 * replaces both: `isMutating` against it is shared by construction, so a
 * second caller sees an in-flight run without anyone having to broadcast it.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { QueryKeys } from '@/enums/queryKeys'
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors'
import { selectLastSyncedAt, setLastSyncedAt } from '@/features/settings/sync/state';
import { setLibraryGenres } from '@/state/redux/slices/librarySlice'
import { setServerAlbumStats, setServerSongStats } from '@/state/redux/slices/statsSlice'
import { useApi } from '@/providers/registry/useApi'
import { catalogSyncKey } from '@/features/library/catalogQueries'
import { runCatalogSync } from '@/features/library/catalogSync'
import { useCatalogSyncStatus } from '@/features/library/useCatalogSyncStatus'

const SYNC_THROTTLE_MS = 30 * 60 * 1000

export function useSync() {
  const queryClient = useQueryClient()
  const dispatch = useDispatch()
  const api = useApi()
  const activeServer = useSelector(selectActiveServer)
  const lastSyncedAt = useSelector(selectLastSyncedAt)
  const lastSyncedAtRef = useRef(lastSyncedAt)

  const serverId = activeServer?.id
  const isConnected = !!serverId && !!activeServer?.isAuthenticated
  const { isSyncing } = useCatalogSyncStatus(serverId)

  useEffect(() => {
    lastSyncedAtRef.current = lastSyncedAt
  }, [lastSyncedAt])

  const syncMutation = useMutation({
    mutationKey: serverId ? catalogSyncKey(serverId) : ['catalog-sync'],
    mutationFn: ({ force }: { force: boolean }) =>
      runCatalogSync({ queryClient, api, serverId: serverId!, force }),
    onSuccess: result => {
      if (!serverId) return
      // Each of these replaces a server's whole namespace, so an empty list is
      // dispatched as nothing rather than as "there is nothing" — an origin
      // that reports no play counts must not wipe locally-tracked ones.
      if (result.albumStats.length > 0) {
        dispatch(setServerAlbumStats({ serverId, stats: result.albumStats }))
      }
      if (result.songStats.length > 0) {
        dispatch(setServerSongStats({ serverId, stats: result.songStats }))
      }
      if (result.genres) dispatch(setLibraryGenres({ serverId, genres: result.genres }))

      if (result.hasData) {
        const syncedAt = Date.now()
        lastSyncedAtRef.current = syncedAt
        dispatch(setLastSyncedAt(syncedAt))
      }
    },
  })

  const sync = useCallback(async (force = false) => {
    if (!isConnected || !serverId) return
    const lastSync = lastSyncedAtRef.current
    if (!force && lastSync !== null && Date.now() - lastSync < SYNC_THROTTLE_MS) return
    // The client is the one that knows whether a run is already in flight,
    // across every instance of this hook.
    if (queryClient.isMutating({ mutationKey: catalogSyncKey(serverId) }) > 0) return
    await syncMutation.mutateAsync({ force })
  }, [isConnected, serverId, queryClient, syncMutation])

  /**
   * Playlists alone, for the screens that can change them.
   *
   * `fetchQuery` writes the same cache entry `usePlaylists` reads, and dedupes
   * an in-flight fetch of that key on its own, so this needs no guard of its
   * own beyond not fighting a full sync.
   */
  const syncPlaylists = useCallback(async () => {
    if (!isConnected || !serverId) return
    if (queryClient.isMutating({ mutationKey: catalogSyncKey(serverId) }) > 0) return
    await queryClient.fetchQuery({
      queryKey: [QueryKeys.Playlists, serverId],
      queryFn: api.playlists.list,
      staleTime: 0,
    })
  }, [api, isConnected, serverId, queryClient])

  return { sync, syncPlaylists, isSyncing, lastSyncedAt }
}
