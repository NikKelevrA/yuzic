import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { useQueryClient } from '@tanstack/react-query';

import type { Album } from '@/domain/entities/Album';
import type { AlbumDetail } from '@/domain/entities/Detail';
import { useApi } from '@/providers/registry/useApi';
import { ALL_SOURCES } from '@/features/sources/registry';
import { QueryKeys } from '@/state/query/queryKeys';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';

/** A catalogue album's track list changes about as often as the album does. */
const CATALOGUE_ALBUM_STALE_MS = 1000 * 60 * 60 * 24;

/**
 * Loads an album's tracks as a downloader asks for them, from wherever the
 * album came from: its catalogue source for an outside album, the active
 * server for one already in the library.
 *
 * Asked only when a track-only downloader is chosen for an album Get, so an
 * album sheet opened from a list — which never loaded the tracks — still has
 * them to send. A cached album costs no request.
 */
export function useAlbumTrackLoader(): (album: Album) => Promise<{ title: string; artist: string }[]> {
  const api = useApi();
  const queryClient = useQueryClient();
  const serverId = useSelector(selectActiveServerId);

  return useCallback(async (album: Album) => {
    let detail: AlbumDetail | null;
    if (album.provenance.origin === 'integration') {
      const providerId = album.provenance.providerId;
      detail = await queryClient.fetchQuery({
        queryKey: [QueryKeys.ExternalAlbum, providerId, album.nativeId, 'tracks'],
        queryFn: async () => (await ALL_SOURCES.find(source => source.id === providerId)?.fetchAlbum(album.nativeId)) ?? null,
        staleTime: CATALOGUE_ALBUM_STALE_MS,
      });
    } else {
      detail = await queryClient.fetchQuery({
        queryKey: [QueryKeys.Album, serverId, album.nativeId],
        queryFn: () => api.albums.get(album.nativeId),
        staleTime: staleTime.albums,
      });
    }
    return (detail?.songs ?? []).map(song => ({
      title: song.title,
      artist: song.artist.name || album.artist.name,
    }));
  }, [api, queryClient, serverId]);
}
