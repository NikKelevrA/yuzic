import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useTheme } from '@/hooks/useTheme';
import { useApi } from '@/api';
import { notify } from '@/components/toast';
import { useAudiomuseConfig } from '@/state/redux/selectors/audiomuseSelectors';
import { useCanGeneratePlaylist, generateSimilarPlaylistForArtist } from '@/features/audiomuse/generatePlaylist';
import { selectArtistPlayCount } from '@/state/redux/selectors/statsSelectors';
import { usePlayingActions } from '@/contexts/PlayingContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useEnabledExternalSources } from '@/features/sources/registry';
import { useArtistAlbums } from '@/hooks/artists';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import { useLazyArtistSongs } from '@/components/options/useLazyCollectionDetails';
import { useCollectionPlaybackActions } from '../shared/playbackActions';
import { useGeneratePlaylistAction } from '../shared/generatePlaylistAction';
import { resolveActions } from '../types';
import { artistActions, type ArtistActionContext } from '../registry/artistActions';

export function useArtistOptionsActions(
  artist: Artist | null, opts: { hideGoToArtist: boolean; isSheetOpen: boolean; close: () => void }
) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const api = useApi();
  const playingActions = usePlayingActions();
  const { downloadAlbumById, getCollectionDownloadState } = useDownload();
  const enabledSources = useEnabledExternalSources();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const audiomuseConfig = useAudiomuseConfig();
  const canGeneratePlaylist = useCanGeneratePlaylist();
  const playCount = useSelector(selectArtistPlayCount(artist?.nativeId ?? ''));

  const artistAlbums = useArtistAlbums(artist?.nativeId ?? '');
  const { songs: artistSongs, songsLoading } = useLazyArtistSongs(artist?.nativeId, artistAlbums, opts.isSheetOpen);

  const buildCollection = useCallback((songs: Song[]) => {
    if (!artist) return null;
    const playlist: Playlist = {
      localId: makeLocalId('playlist', artist.provenance, `artist:${artist.nativeId}`),
      nativeId: artist.nativeId, provenance: artist.provenance, externalIds: {}, libraryState: artist.libraryState,
      title: artist.name, cover: artist.cover, isOwned: false, songIds: songs.map(song => song.localId),
    };
    return { playlist, songs };
  }, [artist]);

  const playback = useCollectionPlaybackActions(playingActions);
  const collection = useMemo(() => buildCollection(artistSongs), [buildCollection, artistSongs]);

  const { isDownloaded, isDownloading: isCollectionDownloading } = getCollectionDownloadState(artistSongs.map(s => s.localId));
  const isDownloading = isDownloadingAll || isCollectionDownloading;
  const playbackDisabled = songsLoading || !artistSongs.length;

  const { isGenerating: isGeneratingPlaylist, generate: generatePlaylist } = useGeneratePlaylistAction({
    run: () => {
      if (!artist) throw new Error('artist not loaded');
      return generateSimilarPlaylistForArtist(api, audiomuseConfig, artist, artistSongs, { size: 25 });
    },
    t, generatedKey: 'artistOptions.toasts.playlistGenerated', failedKey: 'artistOptions.toasts.playlistGenerationFailed', close: opts.close,
  });

  const inFlightDownloadRef = useRef(false);
  const downloadAll = async () => {
    if (isDownloaded || isDownloading || !artistAlbums.length || inFlightDownloadRef.current) return;
    inFlightDownloadRef.current = true;
    setIsDownloadingAll(true);
    try {
      await Promise.all(artistAlbums.map(album => downloadAlbumById(album.nativeId)));
    } catch {
      notify.error(t('artistOptions.downloadAllFailed'));
    } finally {
      inFlightDownloadRef.current = false;
      setIsDownloadingAll(false);
    }
  };

  if (!artist) {
    return { actions: [], songsLoading: false, artistAlbums, playCount };
  }

  const ctx: ArtistActionContext = {
    kind: 'artist', origin: 'library', artist, t, colors, close: opts.close,
    playbackDisabled, songsLoading, isDownloaded, isDownloading, isGeneratingPlaylist, canGeneratePlaylist,
    hasExternalSources: enabledSources.length > 0, hideGoToArtist: opts.hideGoToArtist,
    handlers: {
      play: () => playback.play(collection, artistSongs, false, opts.close),
      shuffle: () => playback.play(collection, artistSongs, true, opts.close),
      addToQueue: () => playback.addToQueueOrPlay(collection, artistSongs, opts.close),
      shuffleToQueue: () => playback.shuffleToQueue(collection, artistSongs, opts.close),
      generatePlaylist: () => void generatePlaylist(),
      downloadAll: () => void downloadAll(),
      goToArtist: () => { opts.close(); router.push({ pathname: '/artistView', params: { id: artist.nativeId } }); },
      viewExternal: () => {
        opts.close();
        router.push({ pathname: '/artistView', params: { forceExternal: 'true', mbid: artist.externalIds.mbid ?? undefined, name: artist.name } });
      },
    },
  };

  return { actions: resolveActions(artistActions, ctx), songsLoading, artistAlbums, playCount };
}
