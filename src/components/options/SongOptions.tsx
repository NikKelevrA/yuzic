import React, { forwardRef, useMemo, useRef } from 'react';
import { Alert, StyleSheet } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Heart, CirclePlus, Disc, Radio, Mic2, ListEnd, ListStart, CheckCircle, ArrowDownCircle, Sparkles, CloudDownload, Download, Play, ChevronRight } from 'lucide-react-native';
import { useApi } from '@/api';
import { selectIsAudiomuseConfigured, selectAudiomuseConfig } from '@/utils/redux/selectors/audiomuseSelectors';
import { generateSimilarPlaylistForSong } from '@/features/audiomuse/generatePlaylist';

import type { Song } from '@/domain/entities/Song';
import type { Album } from '@/domain/entities/Album';
import { usePlayingState, usePlayingActions } from '@/contexts/PlayingContext';
import { useSelector, useDispatch } from 'react-redux';
import { selectSongPlayCount } from '@/utils/redux/selectors/statsSelectors';
import { notify } from '@/components/toast';
import { useTheme } from '@/hooks/useTheme';
import { useRouter } from 'expo-router';
import { useStarredSongs, useStarSong, useUnstarSong } from '@/hooks/starred';
import { useTranslation } from 'react-i18next';
import { renderBackdrop } from '@/components/BottomSheetBackdrop';
import { useIsOffline } from '@/hooks/useIsOffline';
import { formatDuration } from '@/utils/formatDuration';
import { useDownload } from '@/contexts/DownloadContext';
import {
  useAnyDownloaderConnected,
  useAnyTrackDownloaderConnected,
} from '@/features/downloaders/registry';
import GetReviewSheet from '@/components/options/GetReviewSheet';
import { useSheetRef } from '@/utils/useSheetRef';
import {
  OptionSheetChipsRow,
  OptionSheetDivider,
  OptionSheetHeader,
  OptionSheetInfoRow,
  OptionSheetRow,
  OptionSheetSectionLabel,
  optionSheetStyles,
  useOptionSheetBackground,
} from './OptionSheetPrimitives';
import { iconSize, spacing, statusColor } from '@/constants/design';
import haptics, { selection as hapticsSelection } from '@/utils/haptics';
import { selectActiveServerId } from '@/utils/redux/selectors/serversSelectors';
import { selectIsWanted } from '@/utils/redux/selectors/wantsSelectors';
import { addWant, removeWant } from '@/utils/redux/slices/wantsSlice';

type SongOptionsProps = {
  selectedSong: Song;
  /** Library-song-only: opens the add-to-playlist sheet. Ignored for external songs. */
  onAddToPlaylist?: () => void;
  onNavigate?: () => void;
  /** External-song-only: album context for its options sheet. */
  albumTitle?: string;
  /** External-song-only: album context for its options sheet. */
  albumArtist?: string;
  /** External-song-only: called (and the sheet dismissed) when "Play" is pressed. */
  onPlay?: () => void;
};

function formatDate(value: string | number | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const year = d.getFullYear();
  const month = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate();
  return `${month} ${day}, ${year}`;
}

/**
 * True when `song` came from an external catalog (Deezer/etc) rather than
 * the user's library — read off `provenance`, the one place that
 * distinction lives now that there is a single `Song` type. Mirrors
 * `isExternalSong` in `components/rows/SongRow`.
 */
function isExternalSongOrigin(song: Song): boolean {
  return song.provenance.origin === 'integration';
}

const SongOptions = forwardRef<BottomSheetModal, SongOptionsProps>(
  ({ selectedSong, onAddToPlaylist, onNavigate, albumTitle, albumArtist, onPlay }, ref) => {
    if (isExternalSongOrigin(selectedSong)) {
      return (
        <ExternalSongOptionsSheet
          ref={ref}
          song={selectedSong}
          albumTitle={albumTitle ?? ''}
          albumArtist={albumArtist ?? ''}
          onPlay={onPlay}
        />
      );
    }
    return (
      <LibrarySongOptionsSheet
        ref={ref}
        selectedSong={selectedSong}
        onAddToPlaylist={onAddToPlaylist ?? (() => {})}
        onNavigate={onNavigate}
      />
    );
  }
);

SongOptions.displayName = 'SongOptions';

export default SongOptions;

// ---------------------------------------------------------------------------
// Library song action set (unchanged from the pre-merge SongOptions body,
// including the generateSimilarPlaylist wiring).
// ---------------------------------------------------------------------------

type LibrarySongOptionsProps = {
  selectedSong: Song;
  onAddToPlaylist: () => void;
  onNavigate?: () => void;
};

const LibrarySongOptionsSheet = forwardRef<
  BottomSheetModal,
  LibrarySongOptionsProps
>(({ selectedSong, onAddToPlaylist, onNavigate }, ref) => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const isOffline = useIsOffline();

    const snapPoints = useMemo(() => ['55%', '90%'], []);

    const router = useRouter();
    const { currentSong } = usePlayingState();
    const { addToQueue, playNext, playSimilar } = usePlayingActions();
    const instantMixInFlightRef = useRef(false);
    const generatePlaylistInFlightRef = useRef(false);
    const [isGeneratingPlaylist, setIsGeneratingPlaylist] = React.useState(false);
    const api = useApi();
    const audiomuseConfigured = useSelector(selectIsAudiomuseConfigured);
    const audiomuseConfig = useSelector(selectAudiomuseConfig);
    const playCount = useSelector(selectSongPlayCount(selectedSong.nativeId));

    const { songs: starredSongs } = useStarredSongs();
    const starSong = useStarSong();
    const unstarSong = useUnstarSong();

    const isStarred = starredSongs.some(
      s => s.localId === selectedSong.localId
    );

    const { downloadTrack, deleteDownloadedTrack, isTrackDownloaded, isTrackDownloading } = useDownload();
    const isDownloaded = isTrackDownloaded(selectedSong.localId);
    const isDownloading = isTrackDownloading(selectedSong.localId);

    const sheetBg = useOptionSheetBackground();

    const close = () => {
      (ref as any)?.current?.dismiss();
    };

    const toggleFavorite = async () => {
      haptics.selection();
      try {
        if (isStarred) {
          await unstarSong.mutateAsync(selectedSong.nativeId);
          notify.success(t(
            isOffline
              ? 'songOptions.toasts.removedFromFavoritesOffline'
              : 'songOptions.toasts.removedFromFavorites',
            { title: selectedSong.title }
          ));
        } else {
          await starSong.mutateAsync(selectedSong.nativeId);
          notify.success(t(
            isOffline
              ? 'songOptions.toasts.addedToFavoritesOffline'
              : 'songOptions.toasts.addedToFavorites',
            { title: selectedSong.title }
          ));
        }
      } catch {
        notify.error(t('songOptions.toasts.updateFavoritesFailed'));
      } finally {
        close();
      }
    };

    const confirmRemoveDownload = () => {
      Alert.alert(
        t('settings.library.downloads.removeTitle'),
        t('settings.library.downloads.removeBody', { title: selectedSong.title }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteDownloadedTrack(selectedSong.localId);
              } catch {
                notify.error(t('settings.library.downloads.removeFailedBody'));
              }
            },
          },
        ]
      );
    };

    const handleDownload = async () => {
      if (isDownloading) return;
      if (isDownloaded) {
        confirmRemoveDownload();
        return;
      }
      try {
        await downloadTrack(selectedSong);
      } catch {
        notify.error(t('songOptions.toasts.downloadFailed', { title: selectedSong.title }));
      }
    };

    const handleAddToEndQueue = async () => {
      if (!currentSong) {
        notify.error(t('songOptions.toasts.nothingPlaying'));
        return;
      }

      if (selectedSong.localId === currentSong.localId) {
        notify.error(t('songOptions.toasts.alreadyPlaying', { title: selectedSong.title }));
        return;
      }

      try {
        await addToQueue(selectedSong);
        notify.success(t('songOptions.toasts.addedToQueue', { title: selectedSong.title }));
      } catch {
        notify.error(t('songOptions.toasts.addToQueueFailed'));
      } finally {
        close();
      }
    };

    const handleAddToQueue = async () => {
      if (!currentSong) {
        notify.error(t('songOptions.toasts.nothingPlaying'));
        return;
      }

      if (selectedSong.localId === currentSong.localId) {
        notify.error(t('songOptions.toasts.alreadyPlaying', { title: selectedSong.title }));
        return;
      }

      try {
        await playNext(selectedSong);
        notify.success(t('songOptions.toasts.playNext', { title: selectedSong.title }));
      } catch {
        notify.error(t('songOptions.toasts.playNextFailed'));
      } finally {
        close();
      }
    };

    const handleAddToPlaylist = () => {
      close();
      requestAnimationFrame(onAddToPlaylist);
    };

    const handleGoToAlbum = () => {
      close();
      onNavigate?.();
      router.push({ pathname: '/albumView', params: { id: selectedSong.album.nativeId } });
    };

    const handleGoToArtist = () => {
      close();
      onNavigate?.();
      router.push({ pathname: '/artistView', params: { id: selectedSong.artist.nativeId } });
    };

    const handleInstantMix = async () => {
      if (instantMixInFlightRef.current) return;
      instantMixInFlightRef.current = true;
      try {
        await playSimilar(selectedSong);
      } catch {
        notify.error(t('songOptions.toasts.instantMixFailed'));
      } finally {
        instantMixInFlightRef.current = false;
        close();
      }
    };

    const handleGeneratePlaylist = async () => {
      if (generatePlaylistInFlightRef.current || !audiomuseConfigured) return;
      generatePlaylistInFlightRef.current = true;
      setIsGeneratingPlaylist(true);
      try {
        const result = await generateSimilarPlaylistForSong(api, audiomuseConfig, selectedSong, { size: 25 });
        notify.success(t('songOptions.toasts.playlistGenerated', { count: result.trackCount }));
        close();
        router.push({ pathname: '/playlistView', params: { id: result.playlistId } });
      } catch {
        notify.error(t('songOptions.toasts.playlistGenerationFailed'));
      } finally {
        generatePlaylistInFlightRef.current = false;
        setIsGeneratingPlaylist(false);
      }
    };

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backgroundStyle={[optionSheetStyles.sheetBackground, sheetBg]}
        stackBehavior='push'
      >
        <BottomSheetScrollView
          testID="song-options-sheet"
          style={sheetBg}
          contentContainerStyle={optionSheetStyles.sheetContent}
        >
          <OptionSheetHeader
            cover={selectedSong.cover}
            title={selectedSong.title}
            subtitle={selectedSong.artist.name || t('songOptions.unknownArtist')}
          />

          <OptionSheetDivider />

          <OptionSheetRow
            icon={<Heart size={iconSize.loader} color={statusColor.favorite} fill={isStarred ? statusColor.favorite : 'none'} />}
            label={isStarred ? t('songOptions.actions.unfavorite') : t('songOptions.actions.favorite')}
            onPress={toggleFavorite}
          />

          <OptionSheetRow
            icon={<ListStart size={iconSize.loader} color={colors.secondary} />}
            label={t('songOptions.actions.addToQueue')}
            onPress={handleAddToQueue}
          />

          <OptionSheetRow
            icon={<ListEnd size={iconSize.loader} color={colors.secondary} />}
            label={t('songOptions.actions.addToEnd')}
            onPress={handleAddToEndQueue}
          />

          <OptionSheetRow
            icon={<CirclePlus size={iconSize.loader} color={colors.secondary} />}
            label={t('songOptions.actions.addToPlaylist')}
            onPress={handleAddToPlaylist}
          />

          <OptionSheetRow
            icon={
              isDownloaded ? (
                <CheckCircle size={iconSize.loader} color={colors.subtext} />
              ) : (
                <ArrowDownCircle size={iconSize.loader} color={colors.secondary} />
              )
            }
            label={isDownloading ? t('songOptions.actions.downloading') : isDownloaded ? t('songOptions.actions.downloaded') : t('songOptions.actions.download')}
            onPress={handleDownload}
            disabled={isDownloading}
            loading={isDownloading}
            dimLabel={isDownloaded || isDownloading}
          />

          {selectedSong.album.nativeId && (
            <OptionSheetRow
              icon={<Disc size={iconSize.loader} color={colors.secondary} />}
              label={t('songOptions.actions.goToAlbum')}
              onPress={handleGoToAlbum}
            />
          )}

          {selectedSong.artist.nativeId && (
            <OptionSheetRow
              icon={<Mic2 size={iconSize.loader} color={colors.secondary} />}
              label={t('songOptions.actions.goToArtist')}
              onPress={handleGoToArtist}
            />
          )}

          <OptionSheetRow
            icon={<Radio size={iconSize.loader} color={colors.secondary} />}
            label={t('songOptions.actions.instantMix')}
            onPress={handleInstantMix}
          />

          {audiomuseConfigured && (
            <OptionSheetRow
              icon={<Sparkles size={iconSize.loader} color={colors.secondary} />}
              label={t('songOptions.actions.generatePlaylist')}
              onPress={handleGeneratePlaylist}
              disabled={isGeneratingPlaylist}
              loading={isGeneratingPlaylist}
            />
          )}

          <OptionSheetDivider />

          <OptionSheetSectionLabel label={t('songOptions.sections.media')} />
          <OptionSheetInfoRow
            label={t('songOptions.media.duration')}
            value={formatDuration(selectedSong.durationSeconds)}
          />
          <OptionSheetInfoRow label={t('songOptions.media.plays')} value={playCount} />
          {selectedSong.audio?.bitrateKbps != null && (
            <OptionSheetInfoRow
              label={t('songOptions.media.bitrate')}
              value={t('songOptions.media.kbps', { value: selectedSong.audio.bitrateKbps })}
            />
          )}
          {selectedSong.audio?.sampleRateHz != null && (
            <OptionSheetInfoRow
              label={t('songOptions.media.sampleRate')}
              value={t('songOptions.media.hz', { value: selectedSong.audio.sampleRateHz })}
            />
          )}
          {selectedSong.audio?.bitsPerSample != null && (
            <OptionSheetInfoRow
              label={t('songOptions.media.bitsPerSample')}
              value={selectedSong.audio.bitsPerSample}
            />
          )}
          {selectedSong.audio?.mimeType && (
            <OptionSheetInfoRow
              label={t('songOptions.media.format')}
              value={selectedSong.audio.mimeType}
              valueLines={1}
            />
          )}

          {(selectedSong.discNumber != null || selectedSong.trackNumber != null) && (
            <>
              <OptionSheetSectionLabel label={t('songOptions.sections.track')} spaced />
              {selectedSong.discNumber != null && (
                <OptionSheetInfoRow label={t('songOptions.track.disc')} value={selectedSong.discNumber} />
              )}
              {selectedSong.trackNumber != null && (
                <OptionSheetInfoRow label={t('songOptions.track.track')} value={selectedSong.trackNumber} />
              )}
            </>
          )}

          {(selectedSong.year != null || selectedSong.addedAt != null) && (
            <>
              <OptionSheetSectionLabel label={t('songOptions.sections.dates')} spaced />
              {selectedSong.year != null && (
                <OptionSheetInfoRow
                  label={t('songOptions.dates.released')}
                  value={formatDate(String(selectedSong.year))}
                />
              )}
              {selectedSong.addedAt != null && (
                <OptionSheetInfoRow
                  label={t('songOptions.dates.added')}
                  value={formatDate(selectedSong.addedAt)}
                  valueLines={1}
                />
              )}
            </>
          )}

          {selectedSong.genres.length > 0 && (
            <>
              <OptionSheetSectionLabel label={t('songOptions.sections.other')} spaced />
              <OptionSheetChipsRow label={t('songOptions.other.genres')} values={selectedSong.genres} />
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

LibrarySongOptionsSheet.displayName = 'LibrarySongOptionsSheet';

// ---------------------------------------------------------------------------
// External song action set (moved verbatim from the deleted
// ExternalSongOptions, minus its own trigger button — the row now owns
// that, mirroring the library branch's trigger/sheet split).
// ---------------------------------------------------------------------------

type ExternalSongOptionsSheetProps = {
  song: Song;
  albumTitle: string;
  albumArtist: string;
  onPlay?: () => void;
};

const ExternalSongOptionsSheet = forwardRef<
  BottomSheetModal,
  ExternalSongOptionsSheetProps
>(({ song, albumTitle, albumArtist, onPlay }, ref) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dispatch = useDispatch();

  const downloadSheetRef = useSheetRef();
  const trackDownloadSheetRef = useSheetRef();
  const snapPoints = useMemo(() => ['40%', '70%'], []);

  const canDownload = useAnyDownloaderConnected();
  const canDownloadTrack = useAnyTrackDownloaderConnected();

  const sheetBg = useOptionSheetBackground();

  // Built from the song's own `album`/`artist` refs and provenance rather
  // than a lighter "just enough for a Get" shape: `def.downloadAlbum`
  // (Lidarr's especially) now takes a full domain `Album` and reads
  // `releaseType`/artist ids off it. Those aren't things the song's embedded
  // `AlbumRef` carries, so they fall back to a plain default (`'album'`,
  // empty genres) the same way `registry.ts`'s `stubDeezerArtist` fills a
  // gap in an embedded reference rather than fabricating unrelated data.
  const albumBase = useMemo<Album>(() => ({
    localId: song.album.localId,
    nativeId: song.album.nativeId,
    provenance: song.provenance,
    externalIds: song.album.externalIds,
    libraryState: 'external',
    title: albumTitle,
    cover: song.album.cover,
    artist: song.artist,
    year: song.year,
    releaseDate: song.releaseDate,
    releaseType: 'album',
    genres: song.genres,
    songIds: [],
  }), [song, albumTitle]);

  const track = useMemo(() => ({
    title: song.title,
    artist: song.artist.name || albumArtist,
  }), [song.title, song.artist, albumArtist]);

  const localId = song.localId;

  const activeServerId = useSelector(selectActiveServerId);
  const isWanted = useSelector(selectIsWanted(localId));

  const handleToggleWant = () => {
    if (!activeServerId) return;
    hapticsSelection();
    if (isWanted) {
      dispatch(removeWant({ serverId: activeServerId, localId }));
    } else {
      dispatch(addWant({
        serverId: activeServerId,
        want: {
          localId,
          externalIds: song.externalIds,
          unit: 'track',
          title: song.title,
          artist: song.artist.name || albumArtist,
          origin: 'search',
        },
      }));
    }
  };

  return (
    <>
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backgroundStyle={[optionSheetStyles.sheetBackground, sheetBg]}
        stackBehavior="push"
      >
        <BottomSheetScrollView
          style={sheetBg}
          contentContainerStyle={optionSheetStyles.sheetContent}
        >
          <OptionSheetHeader
            cover={song.cover}
            title={song.title}
            subtitle={`${albumArtist} — ${albumTitle}`}
          />

          <OptionSheetDivider />

          {onPlay && (
            <OptionSheetRow
              icon={<Play size={iconSize.loader} color={colors.secondary} fill={colors.secondary} />}
              label={t('songOptions.actions.play')}
              onPress={() => {
                (ref as any)?.current?.dismiss();
                onPlay();
              }}
            />
          )}

          {localId && (
            <OptionSheetRow
              icon={
                <Heart
                  size={iconSize.loader}
                  color={isWanted ? statusColor.success : colors.secondary}
                  fill={isWanted ? statusColor.success : 'none'}
                />
              }
              label={isWanted ? t('externalAlbum.menu.wanted') : t('externalAlbum.menu.want')}
              onPress={handleToggleWant}
            />
          )}

          {canDownloadTrack && (
            <OptionSheetRow
              icon={<Download size={iconSize.loader} color={colors.secondary} />}
              label={t('externalAlbum.menu.getSong')}
              onPress={() => trackDownloadSheetRef.current?.present()}
              trailing={<ChevronRight size={iconSize.inline} color={colors.placeholder} style={styles.chevron} />}
            />
          )}

          {canDownload && (
            <OptionSheetRow
              icon={<CloudDownload size={iconSize.loader} color={colors.secondary} />}
              label={t('externalAlbum.menu.get')}
              onPress={() => downloadSheetRef.current?.present()}
              trailing={<ChevronRight size={iconSize.inline} color={colors.placeholder} style={styles.chevron} />}
            />
          )}

          {(!!onPlay || canDownload || canDownloadTrack || localId) && <OptionSheetDivider />}

          <OptionSheetSectionLabel label={t('songOptions.sections.media')} />
          <OptionSheetInfoRow
            label={t('songOptions.media.duration')}
            value={formatDuration(song.durationSeconds)}
          />
        </BottomSheetScrollView>
      </BottomSheetModal>

      <GetReviewSheet album={albumBase} sheetRef={downloadSheetRef} />
      <GetReviewSheet album={albumBase} track={track} sheetRef={trackDownloadSheetRef} />
    </>
  );
});

ExternalSongOptionsSheet.displayName = 'ExternalSongOptionsSheet';

const styles = StyleSheet.create({
  chevron: { marginLeft: spacing.xs },
});
