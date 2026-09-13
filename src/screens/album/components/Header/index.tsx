import { iconSize, onDark, spacing, statusColor } from '@/constants/design';
import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
} from 'react-native';
import { Ellipsis, Shuffle, Play, CloudDownload, Link } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import { firstResolvableCover } from '@/types/Cover';
import AlbumOptions from '@/components/options/AlbumOptions';
import GetReviewSheet from '@/components/options/GetReviewSheet';
import StatusBanner from '@/components/StatusBanner';
import SpinningLoaderCircle from '@/components/SpinningLoaderCircle';
import DownloadStateIcon from '@/components/DownloadStateIcon';
import { useCollectionDownloadProgress } from '@/hooks/useCollectionDownloadProgress';

import { usePlayingActions } from '@/contexts/PlayingContext';
import { useDownload } from '@/contexts/DownloadContext';
import { useTheme } from '@/hooks/useTheme';
import { useSheetRef } from '@/utils/useSheetRef';
import { formatDuration } from '@/utils/formatDuration';
import { useAnyAlbumDownloaderConnected } from '@/features/downloaders/registry';
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation';
import { useExternalAlbumPreviews } from '@/hooks/albums/useExternalAlbumPreviews';
import { useExternalAlbumStatus } from '@/hooks/useExternalAlbumStatus';
import {
  DetailActionRow,
  DetailCircleAction,
  DetailHeader,
  DetailHeaderBar,
  DetailHeaderIconButton,
  DetailMetaDot,
  DetailMetaRow,
  DetailMetaText,
  DetailPlayAction,
} from '@/components/DetailHeader';
import Touchable from '@/components/Touchable';

type Props = {
  localAlbum: Album | null;
  localSongs?: Song[];
  externalAlbum: Album | null;
  externalSongs?: Song[];
  showNavigation?: boolean;
};

function isCountLikeAlbumText(value?: string | null): boolean {
  return /^\s*\d+\s+albums?\s*$/i.test(value ?? '');
}

const AlbumHeader: React.FC<Props> = ({ localAlbum, localSongs = [], externalAlbum, externalSongs = [], showNavigation = true }) => {
  // `localAlbum.cover ?? externalAlbum?.cover` looks equivalent but is not:
  // `{ kind: 'none' }` is a value, not an absence (see `hasCoverImage`), so a
  // plain `??` chain never falls through it to try the external cover.
  const displayTitle = localAlbum?.title ?? externalAlbum?.title ?? '';
  const displayCover = firstResolvableCover(localAlbum?.cover, externalAlbum?.cover) ?? { kind: 'none' as const };

  return (
    <DetailHeader
      title={displayTitle}
      cover={displayCover}
      rightAction={localAlbum ? <LocalOptionsButton album={localAlbum} /> : undefined}
      meta={localAlbum ? <LocalMetaRow album={localAlbum} songs={localSongs} /> : <ExternalMetaRow album={externalAlbum!} songs={externalSongs} />}
      status={!localAlbum ? <ExternalServerStatusRow album={externalAlbum!} /> : undefined}
      actions={localAlbum ? <LocalActionRow album={localAlbum} songs={localSongs} /> : <ExternalActionRow album={externalAlbum!} songs={externalSongs} />}
      showNavigation={showNavigation}
    />
  );
};

export const AlbumHeaderBar: React.FC<Props> = ({ localAlbum, externalAlbum }) => {
  const displayTitle = localAlbum?.title ?? externalAlbum?.title ?? '';
  return (
    <DetailHeaderBar
      title={displayTitle}
      rightAction={localAlbum ? <LocalOptionsButton album={localAlbum} /> : undefined}
    />
  );
};

function LocalOptionsButton({ album }: { album: Album }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const optionsSheetRef = useSheetRef();
  return (
    <>
      <DetailHeaderIconButton
        accessibilityLabel={t('a11y.common.moreOptions')}
        onPress={() => optionsSheetRef.current?.present()}
      >
        <Ellipsis size={iconSize.header} color={colors.secondary} />
      </DetailHeaderIconButton>
      <AlbumOptions ref={optionsSheetRef} album={album} hideGoToAlbum />
    </>
  );
}

function LocalMetaRow({ album, songs }: { album: Album; songs: Song[] }) {
  const navigation = useNavigation<any>();

  const totalDuration = useMemo(
    () => songs.reduce((sum, song) => sum + song.durationSeconds, 0),
    [songs]
  );

  const metadataItems = useMemo(() => {
    const items: { label: string; type: 'artist' | 'genre' | 'info' }[] = [];
    if (album.artist.name) items.push({ label: album.artist.name, type: 'artist' });
    const genre = album.genres?.[0]?.trim();
    if (genre) items.push({ label: genre, type: 'genre' });
    const year = Number(album.year);
    if (Number.isFinite(year) && year > 0) items.push({ label: String(year), type: 'info' });
    if (!items.length) {
      items.push({ label: `${songs.length} songs`, type: 'info' });
      items.push({ label: formatDuration(totalDuration), type: 'info' });
    }
    return items;
  }, [album.artist.name, album.genres, album.year, songs.length, totalDuration]);

  const handleGenrePress = useCallback((genre: string) => {
    navigation.push('genreView', { genre });
  }, [navigation]);

  return (
    <DetailMetaRow>
      {metadataItems.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 && <DetailMetaDot />}
          {item.type === 'artist' ? (
            <Touchable onPress={() => navigation.push('artistView', { id: album.artist.nativeId })}>
              <DetailMetaText>{item.label}</DetailMetaText>
            </Touchable>
          ) : item.type === 'genre' ? (
            <Touchable onPress={() => handleGenrePress(item.label)}>
              <DetailMetaText>{item.label}</DetailMetaText>
            </Touchable>
          ) : (
            <DetailMetaText>{item.label}</DetailMetaText>
          )}
        </React.Fragment>
      ))}
    </DetailMetaRow>
  );
}

function ExternalMetaRow({ album, songs }: { album: Album; songs: Song[] }) {
  const { t } = useTranslation();
  const { navigateToArtist } = useMatchedNavigation();

  const metadataItems = useMemo(() => {
    const items: string[] = [];
    if (album.artist.name && !isCountLikeAlbumText(album.artist.name)) items.push(album.artist.name);
    if (songs.length > 0) items.push(t('externalAlbum.header.songs', { count: songs.length }));
    return [...new Set(items.map(item => item.trim()).filter(Boolean))];
  }, [album.artist.name, songs.length, t]);

  // The artist reference carried on the album is a thin `ArtistRef`, not a
  // full domain `Artist` — this builds a minimal-but-valid one to navigate
  // with, taking provenance/libraryState from the album itself since the
  // referenced artist has no record of its own here.
  const handleNavigateToArtist = useCallback(() => {
    navigateToArtist({
      localId: album.artist.localId,
      nativeId: album.artist.nativeId,
      provenance: album.provenance,
      externalIds: album.artist.externalIds,
      libraryState: 'external',
      name: album.artist.name,
      cover: album.artist.cover,
      tags: [],
      albumIds: [],
    });
  }, [album, navigateToArtist]);

  return (
    <DetailMetaRow>
      {metadataItems.map((item, index) => (
        <React.Fragment key={`${item}-${index}`}>
          {index > 0 && <DetailMetaDot />}
          {index === 0 && album.artist.name ? (
            <Touchable onPress={handleNavigateToArtist}>
              <DetailMetaText>{item}</DetailMetaText>
            </Touchable>
          ) : (
            <DetailMetaText>{item}</DetailMetaText>
          )}
        </React.Fragment>
      ))}
    </DetailMetaRow>
  );
}

function ExternalServerStatusRow({ album }: { album: Album }) {
  const { t } = useTranslation();
  const albumStatus = useExternalAlbumStatus(album);

  if (albumStatus.kind === 'none') return null;

  if (albumStatus.kind === 'in_library') {
    return (
      <StatusBanner
        icon={<Link size={iconSize.badge} color={statusColor.success} />}
        text={t('externalAlbum.serverStatus.onServer')}
        color={statusColor.success}
        style={styles.serverStatusRow}
      />
    );
  }
  return (
    <StatusBanner
      icon={<SpinningLoaderCircle size={iconSize.badge} color={statusColor.downloading} />}
      text={t('externalAlbum.serverStatus.downloadingToServer', { progress: albumStatus.progress })}
      color={statusColor.downloading}
      style={styles.serverStatusRow}
    />
  );
}

function LocalActionRow({ album, songs }: { album: Album; songs: Song[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { playSongInCollection } = usePlayingActions();
  const { downloadAlbumById, cancelCollectionDownloads, getCollectionDownloadState } = useDownload();

  const songIds = useMemo(() => songs.map(s => s.localId), [songs]);
  const { isDownloaded: isAlbumDownloaded, isDownloading: isAlbumDownloading } =
    getCollectionDownloadState(songIds);
  const downloadFraction = useCollectionDownloadProgress(songIds);

  const toggleDownload = useCallback(async () => {
    if (isAlbumDownloading) {
      await cancelCollectionDownloads(album.nativeId);
      return;
    }
    if (!songs.length || isAlbumDownloaded) return;
    await downloadAlbumById(album.nativeId, songs);
  }, [songs, isAlbumDownloading, isAlbumDownloaded, downloadAlbumById, cancelCollectionDownloads, album.nativeId]);

  const handlePlay = useCallback(() => {
    if (songs.length > 0) playSongInCollection(songs[0], { album, songs }, false);
  }, [songs, album, playSongInCollection]);

  const handleShuffle = useCallback(() => {
    if (songs.length > 0) playSongInCollection(songs[0], { album, songs }, true);
  }, [songs, album, playSongInCollection]);

  return (
    <DetailActionRow>
      <DetailCircleAction onPress={handleShuffle} accessibilityLabel={t('a11y.detail.shuffle')}>
        <Shuffle size={iconSize.row} color={colors.secondary} />
      </DetailCircleAction>

      <DetailPlayAction onPress={handlePlay} accessibilityLabel={t('a11y.detail.play')}>
        <Play size={iconSize.control} color={colors.onThemeColor} fill={colors.onThemeColor} />
      </DetailPlayAction>

      <DetailCircleAction
        onPress={() => void toggleDownload()}
        accessibilityLabel={t(
          isAlbumDownloading
            ? 'a11y.detail.cancelDownload'
            : isAlbumDownloaded
              ? 'a11y.detail.downloaded'
              : 'a11y.detail.download'
        )}
      >
        <DownloadStateIcon
          isDownloaded={isAlbumDownloaded}
          isDownloading={isAlbumDownloading}
          progress={downloadFraction}
          color={colors.secondary}
        />
      </DetailCircleAction>
    </DetailActionRow>
  );
}

function ExternalActionRow({ album, songs }: { album: Album; songs: Song[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const canDownload = useAnyAlbumDownloaderConnected();
  const { playSongInCollection } = usePlayingActions();
  const albumStatus = useExternalAlbumStatus(album);
  const previews = useExternalAlbumPreviews(album, songs);
  const downloadSheetRef = useSheetRef();

  // `streamId` is the slot every adapter uses to carry "the id to build a
  // stream from where that isn't `nativeId`" (see `Song.streamId`) — a
  // preview's playable resource *is* its resolved URL, so this attaches it
  // the same way `usePreviewPlayer`'s `attachPreviewUrl` does.
  const previewSongs = useMemo<Song[]>(
    () => songs.filter(s => !!previews[s.nativeId]).map(s => ({ ...s, streamId: previews[s.nativeId] })),
    [songs, previews]
  );

  // There is no real playlist behind "play the previews we could resolve" —
  // it's a transient queue seed, not a server object — so this builds a
  // minimal-but-valid domain `Playlist` wrapper, namespaced under the
  // external album's own provenance since that's the only origin these
  // preview tracks have. Mirrors the equivalent build in
  // `components/options/ArtistOptions`.
  const previewCollection = useMemo<{ playlist: Playlist; songs: Song[] }>(() => {
    const provenance = album.provenance;
    const playlist: Playlist = {
      localId: makeLocalId('playlist', provenance, `preview-${album.nativeId}`),
      nativeId: album.nativeId,
      provenance,
      externalIds: {},
      libraryState: 'external',
      title: album.title,
      cover: album.cover,
      isOwned: false,
      songIds: previewSongs.map(s => s.localId),
    };
    return { playlist, songs: previewSongs };
  }, [album, previewSongs]);

  const handlePlay = useCallback(() => {
    if (!previewSongs.length) return;
    playSongInCollection(previewSongs[0], previewCollection);
  }, [previewSongs, previewCollection, playSongInCollection]);

  const handleDownload = useCallback(() => {
    if (!canDownload || albumStatus.kind !== 'none') return;
    downloadSheetRef.current?.present();
  }, [canDownload, albumStatus.kind, downloadSheetRef]);

  return (
    <>
      <DetailActionRow>
        <DetailPlayAction
          onPress={handleDownload}
          disabled={!canDownload || albumStatus.kind !== 'none'}
          accessibilityLabel={t('a11y.detail.downloadToServer')}
        >
          <CloudDownload
            size={iconSize.control}
            color={!canDownload || albumStatus.kind !== 'none' ? 'rgba(255,255,255,0.4)' : onDark.text}
          />
        </DetailPlayAction>

        {previewSongs.length > 0 && (
          <DetailCircleAction onPress={handlePlay} accessibilityLabel={t('a11y.detail.playPreview')}>
            <Play size={iconSize.row} color={colors.secondary} fill={colors.secondary} />
          </DetailCircleAction>
        )}
      </DetailActionRow>

      <GetReviewSheet album={album} sheetRef={downloadSheetRef} />
    </>
  );
}

export default AlbumHeader;

const styles = StyleSheet.create({
  serverStatusRow: {
    marginBottom: spacing.controlGap,
  },
});
