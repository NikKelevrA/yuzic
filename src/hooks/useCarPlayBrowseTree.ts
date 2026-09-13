import { useEffect, useMemo, useRef, useState } from 'react';
import { getBackend } from '@/features/player/activeBackend';
import type { BrowseCategory, BrowseItem } from '@/features/player/browse';
import { useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useAlbums } from '@/hooks/albums';
import { usePlaylists } from '@/hooks/playlists';
import { useStarredSongs } from '@/hooks/starred';
import { useTracks } from '@/hooks/tracks';
import { Server } from '@/types';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import type { Song as DomainSong } from '@/domain/entities/Song';
import type { CoverSource } from '@/types/Cover';
import { buildCover } from '@/utils/builders/buildCover';
import { normalizeMediaUrl } from '@/utils/builders/buildTrackItem';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import { QueryKeys } from '@/enums/queryKeys';
import { selectActiveServer } from '@/utils/redux/selectors/serversSelectors';
import { useApi } from '@/api';
import { staleTime } from '@/constants/staleTime';
import type { ApiAdapter } from '@/api/types';
import { useStreamQuality } from './useStreamQuality';
import { selectPreferredCodec } from '@/utils/redux/selectors/settingsSelectors';
import type { AudioQuality, PreferredCodec } from '@/utils/redux/slices/settingsSlice';

const CARPLAY_ALBUM_LIMIT = 50;
const CARPLAY_PLAYLIST_LIMIT = 50;
const CARPLAY_TRACK_LIMIT = 100;

/**
 * A hydrated playlist ready for the browse tree: display fields taken from
 * the library-synced (now domain) `Playlist`, songs from the server's
 * `PlaylistDetail` already resolved to playable rows. Keyed by `nativeId`,
 * not `localId` — every id this file compares against (a cached query's key,
 * an `api.playlists.get` argument) is the origin's own id, and the browse
 * tree is always built for the one currently active server.
 */
type CarPlayPlaylist = {
  id: string;
  title: string;
  cover: CoverSource;
  songs: BrowseItem[];
};

function isBrowseItem(item: BrowseItem | null): item is BrowseItem {
  return item !== null;
}

function haveSamePlaylistIds(a: CarPlayPlaylist[], b: CarPlayPlaylist[]): boolean {
  return a.length === b.length && a.every((playlist, index) => playlist.id === b[index]?.id);
}

/**
 * CarPlay needs a plain URL per row rather than a player call, so it builds one
 * up front for every track it lists — for a domain `Song`, whether it came
 * from the synced library (`tracks`/`starred`) or a server detail fetch
 * (album/playlist tracks). A domain `Song` has no `id` (only
 * `nativeId`/`localId`) and no pre-built `streamUrl`, so this is the one
 * place that builds a CarPlay row from one.
 *
 * Quality and codec are the user's, the same as on the phone. This asked for
 * `'high'` unconditionally for as long as it existed, so someone who chose
 * Original on WiFi still got a 320kbps stream the moment they got in the car —
 * the setting was derived inside PlayingContext and nowhere else, and this
 * file never saw it.
 */
function toPlayableBrowseItemFromDomainSong(
  api: ApiAdapter,
  song: DomainSong,
  server: Server | null | undefined,
  quality: AudioQuality,
  codec: PreferredCodec
): BrowseItem | null {
  if (!server?.isAuthenticated) return null;
  // `streamId` is the id to build a stream from when it differs from the
  // catalog id.
  const streamUrl = api.songs.buildStreamUrl(song.streamId ?? song.nativeId, quality, codec) || null;
  if (!streamUrl) return null;

  // The song's own provenance says which server it came from, so the mixed-queue
  // check is exact rather than a server-type comparison.
  const { headers, artworkHeaders } = mediaHeadersForSong(server, { song, streamUrl });
  return {
    mediaId: song.localId,
    title: song.title,
    artist: song.artist.name,
    artworkUrl: buildCover(song.cover, 'grid') ?? undefined,
    url: normalizeMediaUrl(streamUrl),
    duration: song.durationSeconds || undefined,
    ...(headers ? { headers } : {}),
    ...(artworkHeaders ? { artworkHeaders } : {}),
  };
}

export function useCarPlayBrowseTree() {
  const queryClient = useQueryClient();
  const api = useApi();
  const apiRef = useRef(api);
  const activeServer = useSelector(selectActiveServer);
  const streamQuality = useStreamQuality();
  const preferredCodec = useSelector(selectPreferredCodec);
  const { albums } = useAlbums();
  const { playlists } = usePlaylists();
  const { songs: starred } = useStarredSongs();
  const { tracks } = useTracks();
  const [hydratedPlaylists, setHydratedPlaylists] = useState<CarPlayPlaylist[]>([]);

  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  const carPlayPlaylistKey = useMemo(
    () => playlists.slice(0, CARPLAY_PLAYLIST_LIMIT).map(playlist => playlist.nativeId).join('|'),
    [playlists]
  );

  const tracksByAlbumId = useMemo(() => {
    const grouped = new Map<string, BrowseItem[]>();
    tracks.forEach(track => {
      const item = toPlayableBrowseItemFromDomainSong(api, track, activeServer, streamQuality, preferredCodec);
      if (!item) return;
      const existing = grouped.get(track.album.nativeId) ?? [];
      existing.push(item);
      grouped.set(track.album.nativeId, existing);
    });
    return grouped;
  }, [api, activeServer, tracks, streamQuality, preferredCodec]);

  useEffect(() => {
    if (!activeServer?.id || !albums.length) return;

    const serverId = activeServer.id;
    const missingAlbums = albums
      .slice(0, CARPLAY_ALBUM_LIMIT)
      .filter(album => {
        const hasCached = !!queryClient.getQueryData<AlbumDetail>([QueryKeys.Album, serverId, album.nativeId]);
        const hasLibraryTracks = !!tracksByAlbumId.get(album.nativeId)?.length;
        return !hasCached && !hasLibraryTracks;
      })
      .slice(0, 20);

    if (!missingAlbums.length) return;

    let cancelled = false;
    Promise.allSettled(
      missingAlbums.map(album =>
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Album, serverId, album.nativeId],
          queryFn: () => apiRef.current.albums.get(album.nativeId),
          staleTime: staleTime.albums,
        })
      )
    ).then(() => { if (!cancelled) { /* browse tree effect re-runs via queryClient cache */ } });

    return () => { cancelled = true; };
  }, [activeServer?.id, albums, queryClient, tracksByAlbumId]);

  useEffect(() => {
    if (!activeServer?.id || !playlists.length) {
      setHydratedPlaylists(current => current.length ? [] : current);
      return;
    }

    let cancelled = false;
    const serverId = activeServer.id;
    const carPlayPlaylists = playlists.slice(0, CARPLAY_PLAYLIST_LIMIT);

    const toCarPlayPlaylist = (
      playlist: (typeof carPlayPlaylists)[number],
      detail: PlaylistDetail | undefined
    ): CarPlayPlaylist | null => {
      if (!detail?.songs?.length) return null;
      const songs = detail.songs
        .map(song => toPlayableBrowseItemFromDomainSong(apiRef.current, song, activeServer, streamQuality, preferredCodec))
        .filter(isBrowseItem);
      if (!songs.length) return null;
      return { id: playlist.nativeId, title: playlist.title, cover: playlist.cover, songs };
    };

    const cachedPlaylists = carPlayPlaylists
      .map(playlist => toCarPlayPlaylist(
        playlist,
        queryClient.getQueryData<PlaylistDetail>([QueryKeys.Playlist, serverId, playlist.nativeId])
      ))
      .filter((playlist): playlist is CarPlayPlaylist => playlist !== null);

    setHydratedPlaylists(current =>
      haveSamePlaylistIds(current, cachedPlaylists) ? current : cachedPlaylists
    );

    const missingPlaylists = carPlayPlaylists.filter(playlist => {
      const cached = queryClient.getQueryData<PlaylistDetail>([QueryKeys.Playlist, serverId, playlist.nativeId]);
      return !(cached?.songs?.length);
    });

    if (!missingPlaylists.length) return;

    Promise.allSettled(
      missingPlaylists.map(playlist =>
        queryClient.fetchQuery({
          queryKey: [QueryKeys.Playlist, serverId, playlist.nativeId],
          queryFn: () => apiRef.current.playlists.get(playlist.nativeId),
          staleTime: staleTime.playlists,
        })
      )
    ).then(results => {
      if (cancelled) return;
      const fetched = results
        .map((result, index) => (
          result.status === 'fulfilled'
            ? toCarPlayPlaylist(missingPlaylists[index], result.value)
            : null
        ))
        .filter((playlist): playlist is CarPlayPlaylist => playlist !== null);
      const nextPlaylists = [...cachedPlaylists, ...fetched];
      setHydratedPlaylists(current =>
        haveSamePlaylistIds(current, nextPlaylists) ? current : nextPlaylists
      );
    });

    return () => {
      cancelled = true;
    };
  }, [activeServer, carPlayPlaylistKey, playlists, preferredCodec, queryClient, streamQuality]);

  useEffect(() => {
    const serverId = activeServer?.id;
    const categories: BrowseCategory[] = [];

    const favoriteItems = starred
      .slice(0, 100)
      .map(song => toPlayableBrowseItemFromDomainSong(api, song, activeServer, streamQuality, preferredCodec))
      .filter(isBrowseItem);
    if (favoriteItems.length) {
      categories.push({ mediaId: 'favorites', title: 'Favorites', items: favoriteItems });
    }

    const albumItems = albums
      .slice(0, CARPLAY_ALBUM_LIMIT)
      .map((album): BrowseItem => {
        // Display fields come from the library-synced (domain) album; only
        // the track list needs the server's detail fetch, so a fetch that
        // hasn't landed yet still renders a browsable, if empty, album row.
        const cachedDetail = serverId
          ? queryClient.getQueryData<AlbumDetail>([QueryKeys.Album, serverId, album.nativeId])
          : undefined;
        const songs = cachedDetail?.songs?.length
          ? cachedDetail.songs
            .map(song => toPlayableBrowseItemFromDomainSong(api, song, activeServer, streamQuality, preferredCodec))
            .filter(isBrowseItem)
          : (tracksByAlbumId.get(album.nativeId) ?? []);

        return {
          mediaId: `album-${album.nativeId}`,
          title: album.title,
          artist: album.artist.name,
          artworkUrl: buildCover(album.cover, 'grid') ?? undefined,
          children: songs.slice(0, CARPLAY_TRACK_LIMIT),
        };
      })
      .filter(item => item.children?.length);
    if (albumItems.length) {
      categories.push({ mediaId: 'albums', title: 'Albums', items: albumItems });
    }

    const playlistItems = hydratedPlaylists
      .filter(playlist => playlist.songs.length)
      .slice(0, CARPLAY_PLAYLIST_LIMIT)
      .map((playlist): BrowseItem => ({
        mediaId: `playlist-${playlist.id}`,
        title: playlist.title,
        artworkUrl: buildCover(playlist.cover, 'grid') ?? undefined,
        children: playlist.songs.slice(0, CARPLAY_TRACK_LIMIT),
      }))
      .filter(item => item.children?.length);
    if (playlistItems.length) {
      categories.push({ mediaId: 'playlists', title: 'Playlists', items: playlistItems });
    }

    try {
      getBackend().setBrowseTree(categories.slice(0, 4));
    } catch {
      // best-effort
    }
  }, [activeServer, albums, api, hydratedPlaylists, preferredCodec, queryClient, starred, streamQuality, tracksByAlbumId]);
}
