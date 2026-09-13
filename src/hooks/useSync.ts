import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDispatch, useSelector } from 'react-redux'
import { QueryKeys } from '@/enums/queryKeys'
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors'
import { selectLastSyncedAt } from '@/utils/redux/selectors/settingsSelectors'
import { setLastSyncedAt } from '@/utils/redux/slices/settingsSlice'
import {
  setLibraryAlbums,
  setLibraryArtists,
  setLibraryPlaylists,
  setLibraryTracks,
  setLibraryGenres,
} from '@/utils/redux/slices/librarySlice'
import {
  setLibraryStarred,
  setLibraryStarredAlbums,
} from '@/utils/redux/slices/libraryStarredSlice'
import { setServerAlbumStats, setServerSongStats } from '@/utils/redux/slices/statsSlice'
import { useApi } from '@/api'
import { staleTime } from '@/constants/staleTime'
import type { Album as DomainAlbum } from '@/domain/entities/Album'
import type { Artist as DomainArtist } from '@/domain/entities/Artist'
import type { Playlist as DomainPlaylist } from '@/domain/entities/Playlist'
import type { Song as DomainSong } from '@/domain/entities/Song'

const SYNC_THROTTLE_MS = 30 * 60 * 1000

let activeSyncServerId: string | null = null
const syncListeners = new Set<() => void>()

function emitSyncState() {
  syncListeners.forEach(listener => listener())
}

function subscribeSyncState(listener: () => void) {
  syncListeners.add(listener)
  return () => {
    syncListeners.delete(listener)
  }
}

function getActiveSyncServerId() {
  return activeSyncServerId
}

export function useSync() {
  const queryClient = useQueryClient()
  const dispatch = useDispatch()
  const api = useApi()
  const activeServer = useSelector(selectActiveServer)
  const lastSyncedAt = useSelector(selectLastSyncedAt)
  const lastSyncedAtRef = useRef(lastSyncedAt)
  const activeSyncId = useSyncExternalStore(
    subscribeSyncState,
    getActiveSyncServerId,
    getActiveSyncServerId
  )

  const isConnected = !!activeServer?.id && !!activeServer?.isAuthenticated

  useEffect(() => {
    lastSyncedAtRef.current = lastSyncedAt
  }, [lastSyncedAt])

  const syncPlaylists = useCallback(async () => {
    if (!isConnected) return
    const serverId = activeServer!.id
    if (activeSyncServerId === serverId) return
    const playlists = await queryClient.fetchQuery({
      queryKey: [QueryKeys.Playlists, serverId],
      queryFn: api.playlists.list,
      staleTime: 0,
    })
    if (playlists) {
      dispatch(setLibraryPlaylists(playlists))
    }
  }, [api, isConnected, activeServer, queryClient, dispatch])

  const sync = useCallback(async (force = false) => {
    if (!isConnected) return
    const now = Date.now()
    const lastSync = lastSyncedAtRef.current
    if (!force && lastSync !== null && now - lastSync < SYNC_THROTTLE_MS) return
    const serverId = activeServer!.id
    if (activeSyncServerId === serverId) return
    activeSyncServerId = serverId
    emitSyncState()

    try {
      const listStaleTime = force ? 0 : staleTime.albums
      const playlistStaleTime = force ? 0 : staleTime.playlists
      const trackStaleTime = force ? 0 : staleTime.tracks
      const genreStaleTime = force ? 0 : staleTime.genres
      const starredStaleTime = force ? 0 : staleTime.starred

      // Phase 1: fetch all lists in parallel
      const [albumsResult, artistsResult, playlistsResult, tracksResult, starredResult, genresResult] = await Promise.allSettled([
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Albums, serverId],
          queryFn: api.albums.list,
          staleTime: listStaleTime,
        }),
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Artists, serverId],
          queryFn: api.artists.list,
          staleTime: force ? 0 : staleTime.artists,
        }),
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Playlists, serverId],
          queryFn: api.playlists.list,
          staleTime: playlistStaleTime,
        }),
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Tracks, serverId],
          queryFn: api.tracks.list,
          staleTime: trackStaleTime,
        }),
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Starred, serverId],
          queryFn: api.starred.list,
          staleTime: starredStaleTime,
        }),
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Genres, serverId],
          queryFn: api.genres.list,
          staleTime: genreStaleTime,
        }),
      ])

      // Immediately dispatch list-level data so the UI is responsive
      const albums = albumsResult.status === 'fulfilled'
        ? albumsResult.value
        : queryClient.getQueryData<DomainAlbum[]>([QueryKeys.Albums, serverId])
      const artists = artistsResult.status === 'fulfilled'
        ? artistsResult.value
        : queryClient.getQueryData<DomainArtist[]>([QueryKeys.Artists, serverId])
      const playlists = playlistsResult.status === 'fulfilled'
        ? playlistsResult.value
        : queryClient.getQueryData<DomainPlaylist[]>([QueryKeys.Playlists, serverId])
      const tracks = tracksResult.status === 'fulfilled'
        ? tracksResult.value
        : queryClient.getQueryData<DomainSong[]>([QueryKeys.Tracks, serverId])
      const genres = genresResult.status === 'fulfilled'
        ? genresResult.value
        : queryClient.getQueryData<string[]>([QueryKeys.Genres, serverId])
      const starred = starredResult.status === 'fulfilled'
        ? starredResult.value
        : queryClient.getQueryData<{ songs: DomainSong[]; albums: DomainAlbum[] }>([QueryKeys.Starred, serverId])
      const hasAnyLibraryData = !!(
        albums?.length ||
        artists?.length ||
        playlists?.length ||
        tracks?.length ||
        genres?.length ||
        starred?.songs?.length
      )

      if (albums) {
        dispatch(setLibraryAlbums(albums))

        // Server-reported play count/last-played, where the origin reports
        // them (Album.serverPlayCount/serverLastPlayedAt). Only dispatched
        // when at least one album actually carries a count: an empty stats
        // list here isn't "nobody has played anything", it's usually "this
        // origin doesn't report play stats at all" (e.g. Jellyfin), and
        // setServerAlbumStats *replaces* this server's whole stats
        // namespace — dispatching it unconditionally would wipe every
        // locally-tracked optimistic play count on every sync.
        const albumStats = albums
          .filter((a): a is DomainAlbum & { serverPlayCount: number } => a.serverPlayCount !== undefined)
          .map(a => ({
            id: a.nativeId,
            playCount: a.serverPlayCount,
            lastPlayedAt: a.serverLastPlayedAt ?? 0,
          }))
        if (albumStats.length > 0) {
          dispatch(setServerAlbumStats({ serverId, stats: albumStats }))
        }
      }
      if (tracks) {
        dispatch(setLibraryTracks(tracks))

        // Same reasoning as the album stats above, for songs.
        const songStats = tracks
          .filter((s): s is DomainSong & { serverPlayCount: number } => s.serverPlayCount !== undefined)
          .map(s => ({
            id: s.nativeId,
            playCount: s.serverPlayCount,
            lastPlayedAt: s.serverLastPlayedAt,
          }))
        if (songStats.length > 0) {
          dispatch(setServerSongStats({ serverId, stats: songStats }))
        }
      }
      if (artists) dispatch(setLibraryArtists(artists))
      if (playlists) dispatch(setLibraryPlaylists(playlists))
      if (genres) dispatch(setLibraryGenres({ serverId, genres }))
      if (starred?.songs) dispatch(setLibraryStarred(starred.songs))
      if (starred?.albums) dispatch(setLibraryStarredAlbums(starred.albums))

      if (hasAnyLibraryData) {
        const syncedAt = Date.now()
        lastSyncedAtRef.current = syncedAt
        dispatch(setLastSyncedAt(syncedAt))
      }
    } finally {
      if (activeSyncServerId === serverId) {
        activeSyncServerId = null
        emitSyncState()
      }
    }
  }, [api, isConnected, activeServer, queryClient, dispatch])

  return { sync, syncPlaylists, isSyncing: activeSyncId === activeServer?.id, lastSyncedAt }
}
