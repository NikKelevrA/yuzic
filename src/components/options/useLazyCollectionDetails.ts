import { useEffect, useMemo, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useApi } from '@/api';
import { fetchAlbumDetailsSettled, type FetchAlbumDetailsArgs } from '@/hooks/albums/fetchAlbumDetails';
import { QueryKeys } from '@/enums/queryKeys';
import { staleTime } from '@/constants/staleTime';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import type { Album } from '@/domain/entities/Album';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';

/**
 * Every track across a set of albums, for a synthetic "all of this artist's
 * songs" collection.
 *
 * A thin flatten over `fetchAlbumDetailsSettled`, which already does the
 * settled-fetch and cache-keying. This used to reimplement that whole pattern,
 * because the shared helper was still typed against the pre-rewrite shapes
 * when this was written; it no longer is.
 */
export async function fetchAlbumSongsSettled(args: FetchAlbumDetailsArgs): Promise<Song[]> {
  const details = await fetchAlbumDetailsSettled(args);
  return details.flatMap(detail => detail.songs);
}

/**
 * Lazily loads an album's tracks the first time its options sheet opens.
 *
 * `Album` never embeds its tracks — see `AlbumDetail` — so there is nothing to
 * type-guard here: every input is the same shape, and every call fetches the
 * detail, with React Query deduping against whatever the album screen has
 * already cached.
 */
export function useLazyAlbumDetail(album: Album | null, isSheetOpen: boolean) {
  const queryClient = useQueryClient();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const [detail, setDetail] = useState<AlbumDetail | null>(null);
  const [songsLoading, setSongsLoading] = useState(false);

  useEffect(() => {
    setDetail(null);
  }, [album?.localId]);

  useEffect(() => {
    if (!isSheetOpen || !album?.nativeId || !activeServer?.id) {
      setSongsLoading(false);
      return;
    }

    let cancelled = false;
    setSongsLoading(true);

    queryClient.fetchQuery({
      queryKey: [QueryKeys.Album, activeServer.id, album.nativeId],
      queryFn: () => api.albums.get(album.nativeId),
      staleTime: staleTime.albums,
    })
      .then(fetched => {
        if (!cancelled) setDetail(fetched);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSongsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeServer?.id, album?.nativeId, api, isSheetOpen, queryClient]);

  return {
    albumWithSongs: detail,
    songs: detail?.songs ?? [],
    songsLoading,
  };
}

/** Same shape as `useLazyAlbumDetail`, for playlists — see there for the rationale. */
export function useLazyPlaylistDetail(playlist: Playlist | null, isSheetOpen: boolean) {
  const queryClient = useQueryClient();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [songsLoading, setSongsLoading] = useState(false);

  useEffect(() => {
    setDetail(null);
  }, [playlist?.localId]);

  useEffect(() => {
    if (!isSheetOpen || !playlist?.nativeId || !activeServer?.id) {
      setSongsLoading(false);
      return;
    }

    let cancelled = false;
    setSongsLoading(true);

    queryClient.fetchQuery({
      queryKey: [QueryKeys.Playlist, activeServer.id, playlist.nativeId],
      queryFn: () => api.playlists.get(playlist.nativeId),
      staleTime: staleTime.playlists,
    })
      .then(fetched => {
        if (!cancelled) setDetail(fetched);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSongsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeServer?.id, api, isSheetOpen, playlist?.nativeId, queryClient]);

  return {
    playlistWithSongs: detail,
    songs: detail?.songs ?? [],
    songsLoading,
  };
}

export function useLazyArtistSongs(
  artistId: string | undefined,
  artistAlbums: Album[],
  isSheetOpen: boolean
) {
  const queryClient = useQueryClient();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(false);

  const albumIdsKey = useMemo(
    () => artistAlbums.map(album => album.nativeId).join('|'),
    [artistAlbums]
  );

  useEffect(() => {
    if (!isSheetOpen || !artistId || !activeServer?.id || !artistAlbums.length) {
      setSongs(current => current.length ? [] : current);
      setSongsLoading(false);
      return;
    }

    let cancelled = false;
    setSongsLoading(true);

    fetchAlbumSongsSettled({
      queryClient,
      serverId: activeServer.id,
      albums: artistAlbums,
      getAlbum: api.albums.get,
    })
      .then(fetchedSongs => {
        if (!cancelled) setSongs(fetchedSongs);
      })
      .catch(() => {
        if (!cancelled) setSongs(current => current.length ? [] : current);
      })
      .finally(() => {
        if (!cancelled) setSongsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeServer?.id, albumIdsKey, api, artistAlbums, artistId, isSheetOpen, queryClient]);

  return { songs, songsLoading };
}
