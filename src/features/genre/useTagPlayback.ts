import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'

import type { Album } from '@/domain/entities/Album'
import type { Song } from '@/domain/entities/Song'
import { notify } from '@/components/toast'
import { fetchAlbumSongsSettled } from '@/components/options/useLazyCollectionDetails'
import { usePlayingActions } from '@/features/playback/PlayingContext'
import { useApi } from '@/providers/registry/useApi'
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors'

/**
 * Playing everything under a tag — a genre or a mood.
 *
 * A tag shelf isn't a real collection: no server-side playlist backs it, so
 * this plays a plain song list rather than fabricating a `PlaylistDetail` for
 * something with no identity of its own. Same pattern as the library's "all
 * tracks" and local-mix shuffles.
 *
 * The songs are fetched on demand rather than held: a tag can cover hundreds
 * of albums, and the screen only needs their tracks if someone presses Play.
 *
 * Lifted out of the genre header when that header went away. It was the only
 * part worth keeping — the rest of it was a blurred copy of one arbitrary
 * album's cover, standing in for a tag that has no artwork of its own.
 */
export function useTagPlayback(tag: string, albums: Album[]) {
  const { t } = useTranslation()
  const api = useApi()
  const queryClient = useQueryClient()
  const activeServer = useSelector(selectActiveServer)
  const { playSongs } = usePlayingActions()
  const [isLoading, setIsLoading] = useState(false)

  const play = useCallback(async (shuffle = false) => {
    if (isLoading) return

    const songs = await (async (): Promise<Song[]> => {
      if (!activeServer?.id || !albums.length) return []
      setIsLoading(true)
      try {
        return await fetchAlbumSongsSettled({
          queryClient,
          serverId: activeServer.id,
          albums,
          getAlbum: api.albums.get,
        })
      } catch {
        return []
      } finally {
        setIsLoading(false)
      }
    })()

    if (!songs.length) {
      notify.error(t('common.oneSecond'))
      return
    }

    await playSongs(songs, { shuffle, contextId: `genre:${tag}` })
  }, [isLoading, activeServer?.id, albums, queryClient, api.albums.get, playSongs, tag, t])

  return { play, isLoading }
}
