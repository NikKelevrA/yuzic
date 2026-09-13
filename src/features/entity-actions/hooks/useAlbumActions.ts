import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/api';
import { notify } from '@/components/toast';
import { useAudiomuseConfig } from '@/state/redux/selectors/audiomuseSelectors';
import { useCanGeneratePlaylist, generateSimilarPlaylistForAlbum } from '@/features/audiomuse/generatePlaylist';
import { selectAlbumPlayCount } from '@/state/redux/selectors/statsSelectors';
import { usePlaying } from '@/contexts/PlayingContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useEnabledExternalSources } from '@/features/sources/registry';
import { useAnyAlbumDownloaderConnected } from '@/features/downloaders/registry';
import { useStarredAlbums, useStarAlbum, useUnstarAlbum } from '@/hooks/starred';
import { useExternalAlbumStatus } from '@/features/downloaders/useExternalAlbumStatus';
import type { Album } from '@/domain/entities/Album';
import { useLazyAlbumDetail } from '@/components/options/useLazyCollectionDetails';
import { toggleFavorite } from '../shared/starActions';
import { useWantToggle } from '../shared/wantActions';
import { useShareAction } from '../shared/shareActions';
import { useCollectionPlaybackActions } from '../shared/playbackActions';
import { useGeneratePlaylistAction } from '../shared/generatePlaylistAction';
import { resolveActions } from '../types';
import { albumLibraryActions, type AlbumLibraryActionContext } from '../registry/albumLibraryActions';
import { albumExternalActions, type AlbumExternalActionContext } from '../registry/albumExternalActions';

export function useAlbumLibraryActions(
  album: Album | null, opts: { hideGoToAlbum: boolean; isSheetOpen: boolean; close: () => void }
) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const api = useApi();
  const enabledSources = useEnabledExternalSources();
  const playing = usePlaying();
  const { downloadAlbumById, getCollectionDownloadState } = useDownload();
  const { albums: starredAlbums } = useStarredAlbums();
  const starAlbum = useStarAlbum();
  const unstarAlbum = useUnstarAlbum();
  const isStarred = starredAlbums.some(a => a.localId === album?.localId);
  const audiomuseConfig = useAudiomuseConfig();
  const canGeneratePlaylist = useCanGeneratePlaylist();
  const playCount = useSelector(selectAlbumPlayCount(album?.nativeId ?? ''));

  const { albumWithSongs, songs, songsLoading } = useLazyAlbumDetail(album, opts.isSheetOpen);
  const songIds = useMemo(() => songs.map(s => s.localId), [songs]);
  const { isDownloaded, isDownloading } = getCollectionDownloadState(songIds);
  const playbackDisabled = songsLoading || !songs.length;

  const playback = useCollectionPlaybackActions(playing);
  const { isSharing, share, canShare } = useShareAction({
    itemId: album?.nativeId, title: album?.title ?? '', message: `${album?.title ?? ''}${album?.artist?.name ? ` — ${album.artist.name}` : ''}`,
    failedKey: 'albumOptions.toasts.shareFailed', close: opts.close,
  });
  const { isGenerating: isGeneratingPlaylist, generate: generatePlaylist } = useGeneratePlaylistAction({
    run: async () => {
      if (!albumWithSongs) throw new Error('album detail not loaded');
      return generateSimilarPlaylistForAlbum(api, audiomuseConfig, albumWithSongs, { size: 25 });
    },
    t, generatedKey: 'albumOptions.toasts.playlistGenerated', failedKey: 'albumOptions.toasts.playlistGenerationFailed', close: opts.close,
  });

  if (!album) {
    return { actions: [], songsLoading: false, albumWithSongs: null, songs: [], playCount: 0 };
  }

  const ctx: AlbumLibraryActionContext = {
    kind: 'album', origin: 'library', album, t, colors, close: opts.close,
    isStarred, playbackDisabled, songsLoading, isDownloaded, isDownloading, isSharing, canShare,
    isGeneratingPlaylist, canGeneratePlaylist, hasExternalSources: enabledSources.length > 0, hideGoToAlbum: opts.hideGoToAlbum,
    handlers: {
      toggleFavorite: () => void toggleFavorite({
        isStarred, star: () => starAlbum.mutateAsync(album.nativeId), unstar: () => unstarAlbum.mutateAsync(album.nativeId),
        t, title: album.title, addedKey: 'albumOptions.toasts.addedToFavorites', removedKey: 'albumOptions.toasts.removedFromFavorites',
        failedKey: 'albumOptions.toasts.updateFavoritesFailed', close: opts.close,
      }),
      play: () => playback.play(albumWithSongs, songs, false, opts.close),
      shuffle: () => playback.play(albumWithSongs, songs, true, opts.close),
      addToNext: () => playback.addToNext(
        albumWithSongs, songs, !!playing.currentSong, opts.close,
        () => notify.error(t('songOptions.toasts.nothingPlaying')),
        () => notify.success(t('albumOptions.toasts.addedNext', { title: albumWithSongs?.album.title ?? album.title }))
      ),
      addToEnd: () => playback.addToQueueOrPlay(albumWithSongs, songs, opts.close,
        () => notify.success(t('albumOptions.toasts.addedToEnd', { title: albumWithSongs?.album.title ?? album.title }))),
      shuffleToQueue: () => playback.shuffleToQueue(albumWithSongs, songs, opts.close,
        () => notify.success(t('albumOptions.toasts.shuffledToQueue', { title: albumWithSongs?.album.title ?? album.title }))),
      generatePlaylist: () => void generatePlaylist(),
      goToAlbum: () => { opts.close(); router.push({ pathname: '/albumView', params: { id: album.nativeId } }); },
      viewExternal: () => {
        if (!album.artist?.name) return;
        opts.close();
        router.push({ pathname: '/albumView', params: { forceExternal: 'true', artist: album.artist.name, title: album.title } });
      },
      share: () => void share(),
      download: async () => {
        if (isDownloaded || isDownloading) return;
        await downloadAlbumById(album.nativeId, songs);
      },
    },
  };

  return { actions: resolveActions(albumLibraryActions, ctx), songsLoading, albumWithSongs, songs, playCount };
}

export function useAlbumExternalActions(album: Album, opts: { close: () => void; openGet: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const status = useExternalAlbumStatus(album);
  const canDownload = useAnyAlbumDownloaderConnected();
  const { isWanted, toggle } = useWantToggle(album.localId, 'album', 'artist-page');

  const ctx: AlbumExternalActionContext = {
    kind: 'album', origin: 'external', album, t, colors, close: opts.close, status, isWanted, canDownload,
    handlers: {
      toggleWant: () => toggle({ externalIds: album.externalIds, title: album.title, artist: album.artist.name }),
      openGet: opts.openGet,
    },
  };

  return { actions: resolveActions(albumExternalActions, ctx), status };
}
