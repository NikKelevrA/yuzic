import { useMemo } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { useTheme } from '@/features/theme/useTheme';
import { notify } from '@/components/toast';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useDownload } from '@/features/offline/DownloadContext';
import { useDeletePlaylist } from '@/features/playlist/useDeletePlaylist';
import { useRenamePlaylist } from '@/features/playlist/useRenamePlaylist';
import { FAVORITES_ID } from '@/constants/favorites';
import type { Playlist } from '@/domain/entities/Playlist';
import { useLazyPlaylistDetail } from '@/components/options/useLazyCollectionDetails';
import { useShareAction } from '../shared/shareActions';
import { useCollectionPlaybackActions } from '../shared/playbackActions';
import { resolveActions } from '../types';
import { playlistActions, type PlaylistActionContext } from '../registry/playlistActions';

export function usePlaylistOptionsActions(
  playlist: Playlist | null, opts: { hideGoToPlaylist: boolean; isSheetOpen: boolean; close: () => void }
) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const playingActions = usePlayingActions();
  const { downloadPlaylistById, getCollectionDownloadState } = useDownload();
  const deletePlaylist = useDeletePlaylist();
  const renamePlaylist = useRenamePlaylist();

  const { playlistWithSongs, songs, songsLoading } = useLazyPlaylistDetail(playlist, opts.isSheetOpen);
  const songIds = useMemo(() => songs.map(s => s.localId), [songs]);
  const { isDownloaded, isDownloading } = getCollectionDownloadState(songIds);
  const playbackDisabled = songsLoading || !songs.length;
  const isFavorites = playlist?.nativeId === FAVORITES_ID;

  const playback = useCollectionPlaybackActions(playingActions);
  const { isSharing, share, canShare } = useShareAction({
    itemId: playlist?.nativeId, title: playlist?.title ?? '', message: playlist?.title ?? '',
    failedKey: 'playlistOptions.toasts.shareFailed', close: opts.close,
  });

  if (!playlist) {
    return { actions: [], songsLoading: false, playlistWithSongs: null, songs: [] };
  }

  const ctx: PlaylistActionContext = {
    kind: 'playlist', origin: 'library', playlist, t, colors, close: opts.close,
    playbackDisabled, songsLoading, isDownloaded, isDownloading, isSharing, canShare,
    isFavorites, isDeleting: deletePlaylist.isPending, hideGoToPlaylist: opts.hideGoToPlaylist,
    handlers: {
      play: () => playback.play(playlistWithSongs, songs, false, opts.close),
      shuffle: () => playback.play(playlistWithSongs, songs, true, opts.close),
      addToQueue: () => playback.addToQueueOrPlay(playlistWithSongs, songs, opts.close),
      shuffleToQueue: () => playback.shuffleToQueue(playlistWithSongs, songs, opts.close),
      goToPlaylist: () => {
        opts.close();
        router.push({ pathname: '/playlistView', params: { id: playlist.nativeId } });
      },
      download: async () => {
        if (isDownloaded || isDownloading) return;
        await downloadPlaylistById(playlist.nativeId, songs);
      },
      share: () => void share(),
      rename: () => {
        if (isFavorites) return;
        Alert.prompt(
          t('playlistOptions.rename.title'), undefined,
          async (newName?: string) => {
            const trimmed = newName?.trim();
            if (!trimmed || trimmed === playlist.title) return;
            try {
              await renamePlaylist.mutateAsync({ id: playlist.nativeId, newName: trimmed });
              notify.success(t('playlistOptions.toasts.renamed'));
            } catch { notify.error(t('playlistOptions.toasts.renameFailed')); }
          },
          'plain-text', playlist.title, t('playlistOptions.rename.placeholder')
        );
      },
      delete: () => {
        if (isFavorites) return;
        Alert.alert(
          t('playlistOptions.delete.title'), t('playlistOptions.delete.body', { title: playlist.title }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.delete'), style: 'destructive',
              onPress: async () => {
                try {
                  await deletePlaylist.mutateAsync(playlist.nativeId);
                  opts.close();
                  if (opts.hideGoToPlaylist) navigation.goBack();
                  notify.success(t('playlistOptions.toasts.deleted'));
                } catch { notify.error(t('playlistOptions.toasts.deleteFailed')); }
              },
            },
          ]
        );
      },
    },
  };

  return { actions: resolveActions(playlistActions, ctx), songsLoading, playlistWithSongs, songs };
}
