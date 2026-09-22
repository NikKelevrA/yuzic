import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { getBackend } from '@/features/player/activeBackend';
import type { BrowseItem } from '@/features/player/browse';
import { buildCarBrowseTree, type CarCollection } from '@/features/player/carBrowseTree';
import { useAlbums } from '@/features/album/useAlbums';
import { usePlaylists } from '@/features/playlist/usePlaylists';
import { useStarredSongs } from '@/features/library/useStarredSongs';
import { useCatalogStore } from '@/features/library/useCatalogStore';
import { useDownloadState } from '@/features/offline/DownloadContext';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import type { Album } from '@/domain/entities/Album';
import type { Playlist } from '@/domain/entities/Playlist';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import type { LocalId } from '@/domain/identity/LocalId';
import { buildCover } from '@/providers/registry/covers';
import { toEngineBoundaryTrack } from '@/features/playback/engineBoundary';
import type { PlayableResource } from '@/features/playback/playableResource';
import { rememberResource } from '@/features/playback/knownResources';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import { useStreamQuality } from '@/features/playback/useStreamQuality';
import { selectPreferredCodec } from '@/features/settings/playback/state';
import { QueryKeys } from '@/state/query/queryKeys';
import { staleTime } from '@/state/query/staleTime';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { selectAlbumLastPlayedAt, selectPlaylistLastPlayedAt } from '@/state/redux/selectors/statsSelectors';
import { useApi } from '@/providers/registry/useApi';

const RECENT_LIMIT = 12;
const ALBUM_LIMIT = 50;
const PLAYLIST_LIMIT = 50;
const TRACK_LIMIT = 100;
/**
 * Album and playlist details fetched per pass for the car. Bounded because a
 * cold start with a large library would otherwise fire a hundred requests at
 * the server for a screen nobody may open.
 */
const DETAIL_FETCH_LIMIT = 20;

/**
 * The library the car browses: CarPlay, Android Auto and Android Automotive.
 *
 * This gathers what the car shows and turns each song into a playable row;
 * `buildCarBrowseTree` decides the shape. The engine keeps the result and
 * answers the car itself, playing a selection with no JavaScript involved, so
 * the rows have to be complete here: stream URL, headers, artwork.
 *
 * `resolve` is the phone queue's own `resolvePlayableSong`, so a song plays
 * the same way from the car as from the phone. A downloaded copy wins, which
 * is what makes the car work offline, and the user's quality and codec
 * apply. This file used to build its own stream URL and never looked for a
 * download, so every car row streamed, and offline every one of them failed.
 */
export function useCarPlayBrowseTree(resolve: (song: Song) => PlayableResource | null) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);
  // Read so the tree rebuilds when they change; `resolve` reads them itself.
  const streamQuality = useStreamQuality();
  const preferredCodec = useSelector(selectPreferredCodec);
  const offline = useIsOffline();
  const { albums } = useAlbums();
  const { playlists } = usePlaylists();
  const { songs: starred } = useStarredSongs();
  const catalog = useCatalogStore();
  const { downloadedTracks, downloadedTrackCount } = useDownloadState();
  const albumLastPlayedAt = useSelector(selectAlbumLastPlayedAt);
  const playlistLastPlayedAt = useSelector(selectPlaylistLastPlayedAt);
  // Bumped when a detail fetch lands. The query cache is read directly below,
  // and reading it is not a subscription: without this, albums fetched for
  // the car stayed out of it until something unrelated changed.
  const [detailsVersion, setDetailsVersion] = useState(0);

  const serverId = activeServer?.id;

  const recent = useMemo(() => {
    const entries: { kind: 'album' | 'playlist'; entity: Album | Playlist; at: number }[] = [];
    for (const [id, at] of Object.entries(albumLastPlayedAt)) {
      const album = at > 0 ? catalog.albumByNativeId.get(id) : undefined;
      if (album) entries.push({ kind: 'album', entity: album, at });
    }
    for (const [id, at] of Object.entries(playlistLastPlayedAt)) {
      const playlist = at > 0 ? catalog.playlistByNativeId.get(id) : undefined;
      if (playlist) entries.push({ kind: 'playlist', entity: playlist, at });
    }
    return entries.sort((a, b) => b.at - a.at).slice(0, RECENT_LIMIT);
  }, [albumLastPlayedAt, catalog, playlistLastPlayedAt]);

  const carAlbums = useMemo(() => albums.slice(0, ALBUM_LIMIT), [albums]);
  const carPlaylists = useMemo(() => playlists.slice(0, PLAYLIST_LIMIT), [playlists]);

  // Details for what the car will list and cannot yet fill, recent first.
  useEffect(() => {
    if (!serverId || offline) return;
    const wanted = [
      ...recent.map(entry => ({ kind: entry.kind, id: entry.entity.nativeId, entity: entry.entity })),
      ...carAlbums.map(album => ({ kind: 'album' as const, id: album.nativeId, entity: album })),
      ...carPlaylists.map(playlist => ({ kind: 'playlist' as const, id: playlist.nativeId, entity: playlist })),
    ];
    const seen = new Set<string>();
    const missing = wanted.filter(item => {
      const key = `${item.kind}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (item.kind === 'album') {
        return !queryClient.getQueryData([QueryKeys.Album, serverId, item.id])
          && !librarySongs(catalog, item.entity as Album).length;
      }
      return !queryClient.getQueryData<PlaylistDetail>([QueryKeys.Playlist, serverId, item.id])?.songs?.length;
    }).slice(0, DETAIL_FETCH_LIMIT);
    if (!missing.length) return;

    let cancelled = false;
    Promise.allSettled(missing.map(item => item.kind === 'album'
      ? queryClient.fetchQuery({
        queryKey: [QueryKeys.Album, serverId, item.id],
        queryFn: () => api.albums.get(item.id),
        staleTime: staleTime.albums,
      })
      : queryClient.fetchQuery({
        queryKey: [QueryKeys.Playlist, serverId, item.id],
        queryFn: () => api.playlists.get(item.id),
        staleTime: staleTime.playlists,
      })
    )).then(() => {
      if (!cancelled) setDetailsVersion(version => version + 1);
    });
    return () => { cancelled = true; };
  }, [api, carAlbums, carPlaylists, catalog, offline, queryClient, recent, serverId]);

  useEffect(() => {
    const row = (song: Song): BrowseItem | null => {
      const resource = resolve(song);
      if (!resource) return null;
      // A stream needs a signed-in server; a downloaded copy does not.
      if (!resource.filePath && !activeServer?.isAuthenticated) return null;
      // A selection in the car plays without the app; remembering the song is
      // what lets the app show and scrobble the real track once it hears.
      rememberResource(resource);
      const track = toEngineBoundaryTrack(resource, mediaHeadersForSong(activeServer, resource));
      return {
        mediaId: track.id,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUri,
        url: track.uri,
        duration: track.durationSec,
        ...(track.headers ? { headers: track.headers } : {}),
        ...(track.artworkHeaders ? { artworkHeaders: track.artworkHeaders } : {}),
      };
    };
    const rows = (songs: readonly Song[]) =>
      songs.slice(0, TRACK_LIMIT).map(row).filter((item): item is BrowseItem => item !== null);

    const coverFor = (entity: Album | Playlist) => buildCover(entity.cover, 'grid') ?? undefined;

    const albumCollection = (album: Album): CarCollection => {
      const detail = serverId
        ? queryClient.getQueryData<AlbumDetail>([QueryKeys.Album, serverId, album.nativeId])
        : undefined;
      return {
        kind: 'album',
        id: album.nativeId,
        title: album.title,
        subtitle: album.artist.name,
        artworkUrl: coverFor(album),
        tracks: rows(detail?.songs?.length ? detail.songs : librarySongs(catalog, album)),
      };
    };

    const playlistCollection = (playlist: Playlist): CarCollection => {
      const detail = serverId
        ? queryClient.getQueryData<PlaylistDetail>([QueryKeys.Playlist, serverId, playlist.nativeId])
        : undefined;
      return {
        kind: 'playlist',
        id: playlist.nativeId,
        title: playlist.title,
        artworkUrl: coverFor(playlist),
        tracks: rows(detail?.songs ?? []),
      };
    };

    const downloadedSongs = downloadedTracks
      // Download records key tracks by `localId`, stored as a plain string.
      .map(entry => catalog.songs.get(entry.trackId as LocalId))
      .filter((song): song is Song => !!song);

    const categories = buildCarBrowseTree(
      {
        recent: recent.map(entry => entry.kind === 'album'
          ? albumCollection(entry.entity as Album)
          : playlistCollection(entry.entity as Playlist)),
        favorites: rows(starred),
        playlists: carPlaylists.map(playlistCollection),
        albums: carAlbums.map(albumCollection),
        downloads: rows(downloadedSongs),
      },
      {
        recent: t('car.recent'),
        favorites: t('car.favorites'),
        playlists: t('car.playlists'),
        albums: t('car.albums'),
        downloads: t('car.downloads'),
        shuffle: t('car.shuffle'),
      },
      { offline },
    );

    try {
      getBackend().setBrowseTree(categories);
    } catch {
      // best-effort
    }
  }, [
    activeServer, carAlbums, carPlaylists, catalog, detailsVersion, downloadedTrackCount, downloadedTracks,
    offline, preferredCodec, queryClient, recent, resolve, serverId, starred, streamQuality, t,
  ]);
}

/**
 * An album's songs from the synced library, for an album whose detail has not
 * been fetched. The album's own `songIds` order is the server's track order.
 */
function librarySongs(catalog: ReturnType<typeof useCatalogStore>, album: Album): Song[] {
  return album.songIds
    .map(id => catalog.songs.get(id))
    .filter((song): song is Song => !!song);
}
