import { useMemo } from 'react'
import { useSelector } from 'react-redux'

import { useAlbums } from '@/features/album/useAlbums'
import { useArtists } from '@/features/artist/useArtists'
import { usePlaylists } from '@/features/playlist/usePlaylists'
import { useTracks } from '@/features/song/useTracks'
import { useDownload } from '@/features/offline/DownloadContext'
import {
  selectSongLastPlayedAt,
  selectSongPlayCounts,
  selectAlbumLastPlayedAt,
  selectAlbumPlayCounts,
  selectArtistLastPlayedAt,
  selectArtistPlayCounts,
  selectPlaylistLastPlayedAt,
  selectPlaylistPlayCounts,
} from '@/state/redux/selectors/statsSelectors'
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors'
import { selectRatingOverrides } from '@/state/redux/slices/ratingsSlice'
import {
  EMPTY_RATINGS,
  EMPTY_SORT_STATS,
  sortItems,
  usesPlayStats,
  usesRatings,
  type LibraryCollectionType,
  type LibraryItem,
  type SortOrder,
  type SortStats,
} from './librarySort'

/**
 * The library list for one entity type, or the mixed list when given none.
 *
 * Shared by the library tab and the per-type screens so both read the same
 * data and order it the same way.
 */
type LibraryItemsResult = {
  items: LibraryItem[]
  /** True until the data this type needs has arrived. Distinguishes a library
   * that is still syncing from one that is genuinely empty. */
  isLoading: boolean
}

export function useLibraryItems(
  type: LibraryCollectionType | null,
  sortOrder: SortOrder
): LibraryItemsResult {
  const songLastPlayed = useSelector(selectSongLastPlayedAt)
  const songPlays = useSelector(selectSongPlayCounts)
  const albumLastPlayed = useSelector(selectAlbumLastPlayedAt)
  const albumPlays = useSelector(selectAlbumPlayCounts)
  const artistLastPlayed = useSelector(selectArtistLastPlayedAt)
  const artistPlays = useSelector(selectArtistPlayCounts)
  const playlistLastPlayed = useSelector(selectPlaylistLastPlayedAt)
  const playlistPlays = useSelector(selectPlaylistPlayCounts)

  const { albums, isLoading: albumsLoading } = useAlbums()
  const { artists, isLoading: artistsLoading } = useArtists()
  const { playlists, isLoading: playlistsLoading } = usePlaylists()
  const { tracks, isLoading: tracksLoading } = useTracks()
  const { getAllDownloadedCollections, getAllDownloadedTracks } = useDownload()

  const stats = useMemo<SortStats>(
    () => ({
      songLastPlayed, songPlays, albumLastPlayed, albumPlays,
      artistLastPlayed, artistPlays, playlistLastPlayed, playlistPlays,
    }),
    [
      songLastPlayed, songPlays, albumLastPlayed, albumPlays,
      artistLastPlayed, artistPlays, playlistLastPlayed, playlistPlays,
    ],
  )

  // Orders that ignore play data get the stable empty constant, so the list
  // doesn't recompute every time a song is played.
  const statsForSort = usesPlayStats(sortOrder) ? stats : EMPTY_SORT_STATS

  // Same trick for the ratings the user has written since the last sync: only
  // the one order that reads them pays for re-sorting when one changes.
  const serverId = useSelector(selectActiveServerId)
  const ratingOverrides = useSelector(selectRatingOverrides(serverId ?? undefined))
  const ratingsForSort = usesRatings(sortOrder) ? ratingOverrides : EMPTY_RATINGS

  // Tracks saved on their own rather than as part of a saved album or
  // playlist. Without these the Downloaded collection hid every single song
  // downloaded from a track's own options.
  const looseDownloadedTrackIds = useMemo(() => {
    const inCollections = new Set(getAllDownloadedCollections().flatMap(c => c.trackIds))
    const ids = new Set<string>()
    getAllDownloadedTracks().forEach(track => {
      if (!inCollections.has(track.trackId)) ids.add(track.trackId)
    })
    return ids
  }, [getAllDownloadedCollections, getAllDownloadedTracks])

  const downloadedCollectionIds = useMemo(() => {
    const ids = new Set<string>()
    getAllDownloadedCollections().forEach(c => ids.add(c.id))
    return ids
  }, [getAllDownloadedCollections])

  // Only the sources this type actually draws from: a slow track sync must not
  // make the albums screen look like it is still loading.
  const isLoading = (() => {
    switch (type) {
      case 'playlists': return playlistsLoading
      case 'albums': return albumsLoading
      case 'artists': return artistsLoading
      case 'tracks': return tracksLoading
      case 'downloaded': return albumsLoading || playlistsLoading || tracksLoading
      default: return albumsLoading || artistsLoading || playlistsLoading
    }
  })()

  const items = useMemo(() => {
    switch (type) {
      case 'playlists':
        return sortItems(playlists.map(p => ({ kind: 'playlist' as const, data: p })), sortOrder, statsForSort, ratingsForSort)
      case 'albums':
        return sortItems(albums.map(a => ({ kind: 'album' as const, data: a })), sortOrder, statsForSort, ratingsForSort)
      case 'artists':
        return sortItems(artists.map(a => ({ kind: 'artist' as const, data: a })), sortOrder, statsForSort, ratingsForSort)
      case 'tracks':
        return sortItems(tracks.map(tr => ({ kind: 'track' as const, data: tr })), sortOrder, statsForSort, ratingsForSort)
      case 'downloaded':
        // `getAllDownloadedCollections()[].id` is the id `downloadAlbumById`/
        // `downloadPlaylistById` were called with, which they hand straight
        // to `api.albums.get`/`api.playlists.get` — i.e. `nativeId`.
        return sortItems([
          ...albums.filter(a => downloadedCollectionIds.has(a.nativeId)).map(a => ({ kind: 'album' as const, data: a })),
          ...playlists.filter(p => downloadedCollectionIds.has(p.nativeId)).map(p => ({ kind: 'playlist' as const, data: p })),
          ...tracks.filter(tr => looseDownloadedTrackIds.has(tr.localId)).map(tr => ({ kind: 'track' as const, data: tr })),
        ], sortOrder, statsForSort, ratingsForSort)
      default:
        return sortItems([
          ...playlists.map(p => ({ kind: 'playlist' as const, data: p })),
          ...albums.map(a => ({ kind: 'album' as const, data: a })),
          ...artists.map(a => ({ kind: 'artist' as const, data: a })),
        ], sortOrder, statsForSort, ratingsForSort)
    }
  }, [type, sortOrder, statsForSort, ratingsForSort, albums, artists, playlists, tracks, downloadedCollectionIds, looseDownloadedTrackIds])

  return { items, isLoading }
}
