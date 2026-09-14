import { hitSlopFor, iconSize, onDark, spacing, typography } from '@/constants/design';
import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft, Ellipsis, Shuffle, Play } from 'lucide-react-native';
import TurboImage from 'react-native-turbo-image';
import { useSelector } from 'react-redux';
import { MediaImage } from '@/components/MediaImage';
import ArtistOptions from '@/components/options/ArtistOptions';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { usePlayingActions } from '@/contexts/PlayingContext';
import { notify } from '@/components/toast';
import { useArtistAlbums } from '@/hooks/artists/useArtistAlbums';
import { useTracks } from '@/hooks/tracks/useTracks';
import { buildCover } from '@/utils/builders/buildCover';
import { useTheme } from '@/hooks/useTheme';
import { useDownload } from '@/contexts/DownloadContext';
import { useSheetRef } from '@/utils/useSheetRef';
import { useApi } from '@/api';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { fetchAlbumSongsSettled } from '@/components/options/useLazyCollectionDetails';
import {
  DetailActionRow,
  DetailCircleAction,
  DetailPlayAction,
  DetailHeaderBar,
  DetailHeaderIconButton,
  useDetailHeaderInset,
  useDetailHeroTitleLayout,
} from '@/components/DetailHeader';
import SpinningLoaderCircle from '@/components/SpinningLoaderCircle';
import DownloadStateIcon from '@/components/DownloadStateIcon';
import { useCollectionDownloadProgress } from '@/features/downloads/useCollectionDownloadProgress';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/hooks/useRadius';
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel';
import { metadataSourceNameKey } from '@/providers/registry/enrichmentBroker';

type Props = {
  model: ArtistScreenModel;
  showNavigation?: boolean;
};

const ArtistHeader: React.FC<Props> = ({ model, showNavigation = true }) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { isDarkMode, colors } = useTheme();
  const rad = useRadius();
  // The bar floats over this art now, so the wrapper grows by exactly the room
  // it and the status bar take: the cover stays where it was against the
  // content below, and the extra strip is filled with art rather than a band.
  const barInset = useDetailHeaderInset();
  const onTitleLayout = useDetailHeroTitleLayout();

  const { artist, isLocal, resolved, counts } = model;
  const displayName = artist?.name ?? '';
  // The artist's own cover is authoritative — `resolveArtistDetails`
  // (Phase 5 enrichment) is only ever consulted for the gap, so its result
  // is used only when the artist itself has none. Its result is also `null`
  // both while enrichment is off and while it hasn't settled yet, so this
  // never flashes a wrong cover ahead of the real one, same "disabling
  // restores the server view" guarantee the old fetcher-based
  // `useArtworkEnrichment` had.
  const hasOwnCover = artist ? artist.cover.kind !== 'none' : true;
  const displayCover = hasOwnCover ? (artist?.cover ?? { kind: 'none' as const }) : (resolved?.cover.value ?? { kind: 'none' as const });
  const showsEnrichedArtworkLine = !hasOwnCover && !!resolved && resolved.cover.value.kind !== 'none';
  const enrichedArtworkSourceNameKey = showsEnrichedArtworkLine
    ? metadataSourceNameKey(resolved!.cover.sourceId)
    : null;

  const coverUri = buildCover(displayCover, 'background');

  return (
    <>
      <View style={[styles.fullBleedWrapper, { height: ARTIST_HERO_HEIGHT + barInset }]}>
        {coverUri ? (
          <TurboImage
            source={{ uri: coverUri }}
            style={[StyleSheet.absoluteFill, { left: -50, right: -50 }]}
            resizeMode="cover"
            blur={Platform.OS === 'ios' ? 20 : 10}
            fadeDuration={300}
            cachePolicy="dataCache"
          />
        ) : (
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.muted },
            ]}
          />
        )}

        <LinearGradient
          colors={
            isDarkMode
              ? ['rgba(0,0,0,0)', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,1)']
              : [
                'rgba(255,255,255,0)',
                'rgba(255,255,255,0.7)',
                'rgba(255,255,255,1)',
              ]
          }
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.centeredCoverContainer, { borderRadius: rad.pill }]}>
          <MediaImage
            cover={displayCover}
            size="detail"
            style={[styles.centeredCover, { borderRadius: rad.pill }]}
          />
        </View>

        {showNavigation && (
          <View style={styles.header}>
            <Touchable
              testID="detail-back-button"
              accessibilityRole="button"
              accessibilityLabel={t('a11y.common.back')}
              style={[styles.backButton, { borderRadius: rad.md }]}
              hitSlop={hitSlopFor(36)}
              onPress={() => navigation.goBack()}
            >
              <ChevronLeft size={iconSize.header} color={onDark.text} style={{ marginLeft: -2 }} />
            </Touchable>
            {isLocal && artist ? (
              <LocalOptionsButton artist={artist} />
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: spacing.lg }} onLayout={onTitleLayout}>
        <View style={styles.content}>
          <Text
            style={[styles.artistName, { color: colors.secondary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
          >
            {displayName}
          </Text>
          <MetaRow isLocal={isLocal} counts={counts} />
          {enrichedArtworkSourceNameKey && (
            <Text style={[styles.artworkSourceLine, { color: colors.subtext }]}>
              {t('artist.enrichedArtworkSource', { source: t(enrichedArtworkSourceNameKey) })}
            </Text>
          )}
        </View>
      </View>

      {isLocal && artist ? <LocalActionRow artist={artist} /> : null}
    </>
  );
};

export const ArtistHeaderBar: React.FC<Props> = ({ model }) => {
  const displayName = model.artist?.name ?? '';
  return (
    <DetailHeaderBar
      title={displayName}
      rightAction={model.isLocal && model.artist ? <LocalOptionsButton artist={model.artist} /> : undefined}
    />
  );
};

function LocalOptionsButton({ artist }: { artist: Artist }) {
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
      <ArtistOptions ref={optionsSheetRef} artist={artist} hideGoToArtist />
    </>
  );
}

/**
 * One meta row for both modes — the local/external split used to live as
 * two near-identical components (`LocalMetaRow`/`ExternalMetaRow`), each
 * re-deriving the same album/song counts the screen model now computes
 * once (`counts`).
 */
function MetaRow({ isLocal, counts }: { isLocal: boolean; counts: ArtistScreenModel['counts'] }) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const metadataItems = useMemo(() => {
    const items: string[] = [];
    if (isLocal || counts.albums > 0) {
      items.push(`${counts.albums} ${counts.albums === 1 ? t('common.album') : t('common.albums')}`);
    }
    if (isLocal && counts.songs > 0) {
      items.push(`${counts.songs} ${counts.songs === 1 ? t('common.song') : t('common.songs')}`);
    }
    return items;
  }, [isLocal, counts.albums, counts.songs, t]);

  return (
    <View style={styles.metaRow}>
      {metadataItems.map((item, index) => (
        <React.Fragment key={`${item}-${index}`}>
          {index > 0 && <Text style={[styles.metaDot, { color: colors.subtext }]}>•</Text>}
          <Text style={[styles.metaText, { color: colors.subtext }]} numberOfLines={1}>
            {item}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

function LocalActionRow({ artist }: { artist: Artist }) {
  const { t } = useTranslation();
  const { isDarkMode, colors } = useTheme();
  const queryClient = useQueryClient();
  const api = useApi();
  const activeServer = useSelector(selectActiveServer);

  const { playSongInCollection } = usePlayingActions();
  const { downloadAlbumById, getCollectionDownloadState } = useDownload();
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [songsLoading, setSongsLoading] = useState(false);

  const artistAlbums = useArtistAlbums(artist.nativeId);
  const { tracks: allTracks } = useTracks();
  const artistTrackIds = useMemo(
    () => allTracks.filter(track => track.artist.localId === artist.localId).map(track => track.localId),
    [allTracks, artist.localId]
  );

  const fetchArtistSongs = useCallback(async (): Promise<Song[]> => {
    if (!activeServer?.id || !artistAlbums.length) return [];
    return fetchAlbumSongsSettled({
      queryClient,
      serverId: activeServer.id,
      albums: artistAlbums,
      getAlbum: api.albums.get,
    });
  }, [queryClient, activeServer, artistAlbums, api.albums.get]);

  const playArtist = useCallback(async (shuffle = false) => {
    if (songsLoading) return;
    const songs = await (async () => {
      setSongsLoading(true);
      try {
        return await fetchArtistSongs();
      } catch {
        return [];
      } finally {
        setSongsLoading(false);
      }
    })();

    if (!songs.length) {
      notify.error(t('common.oneSecond'));
      return;
    }

    // There is no real playlist behind "play this artist's known songs" —
    // see the equivalent comment in `components/options/ArtistOptions`.
    const playlist: Playlist = {
      localId: makeLocalId('playlist', artist.provenance, `artist:${artist.nativeId}`),
      nativeId: artist.nativeId,
      provenance: artist.provenance,
      externalIds: {},
      libraryState: artist.libraryState,
      title: artist.name,
      cover: artist.cover,
      isOwned: false,
      songIds: songs.map(song => song.localId),
    };

    playSongInCollection(songs[0], { playlist, songs }, shuffle);
  }, [songsLoading, fetchArtistSongs, playSongInCollection, artist, t]);

  const {
    isDownloaded: isArtistFullyDownloaded,
    isDownloading: isArtistDownloading,
  } = getCollectionDownloadState(artistTrackIds);
  const downloadFraction = useCollectionDownloadProgress(artistTrackIds);

  const handleDownloadAll = useCallback(async () => {
    if (isDownloadingAll || isArtistDownloading || isArtistFullyDownloaded || !artistAlbums.length) return;
    setIsDownloadingAll(true);
    try {
      await Promise.all(artistAlbums.map(album => downloadAlbumById(album.nativeId)));
    } finally {
      setIsDownloadingAll(false);
    }
  }, [isDownloadingAll, isArtistDownloading, isArtistFullyDownloaded, artistAlbums, downloadAlbumById]);

  return (
    <DetailActionRow style={styles.buttonRow}>
      <DetailCircleAction
        onPress={() => void playArtist(true)}
        disabled={songsLoading}
        style={isDarkMode ? styles.secondaryButtonDark : styles.secondaryButton}
        accessibilityLabel={t('a11y.detail.shuffle')}
      >
        {songsLoading ? (
          <SpinningLoaderCircle size={iconSize.row} color={colors.secondary} />
        ) : (
          <Shuffle size={iconSize.row} color={colors.secondary} />
        )}
      </DetailCircleAction>

      <DetailPlayAction
        onPress={() => void playArtist(false)}
        disabled={songsLoading}
        accessibilityLabel={t('a11y.detail.play')}
      >
        {songsLoading ? (
          <SpinningLoaderCircle size={iconSize.row} color={colors.onThemeColor} />
        ) : (
          <Play size={iconSize.header} color={colors.onThemeColor} fill={colors.onThemeColor} />
        )}
      </DetailPlayAction>

      <DetailCircleAction
        onPress={() => void handleDownloadAll()}
        disabled={isDownloadingAll || isArtistDownloading}
        style={isDarkMode ? styles.secondaryButtonDark : styles.secondaryButton}
        accessibilityLabel={t(
          isDownloadingAll || isArtistDownloading
            ? 'a11y.detail.downloading'
            : isArtistFullyDownloaded
              ? 'a11y.detail.downloaded'
              : 'a11y.detail.download'
        )}
      >
        <DownloadStateIcon
          isDownloaded={isArtistFullyDownloaded}
          isDownloading={isDownloadingAll || isArtistDownloading}
          // Nothing to measure while the albums are still being enqueued.
          progress={isDownloadingAll ? undefined : downloadFraction}
          color={colors.secondary}
        />
      </DetailCircleAction>
    </DetailActionRow>
  );
}

export default ArtistHeader;

/** The blurred cover behind an artist's name, before the floating bar's inset. */
const ARTIST_HERO_HEIGHT = 300;

const styles = StyleSheet.create({
  fullBleedWrapper: {
    width: '100%',
    height: ARTIST_HERO_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  centeredCoverContainer: {
    position: 'absolute',
    bottom: -32,
    width: 120,
    height: 120,
    overflow: 'hidden',
    backgroundColor: onDark.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredCover: {
    width: '100%',
    height: '100%',
  },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 20 : 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    zIndex: 20,
  },
  backButton: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  artistName: {
    ...typography.display,
    fontWeight: '600',
    textAlign: 'center',
    width: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.tight,
    flexWrap: 'wrap',
  },
  metaDot: {
    ...typography.rowSubtitle,
    marginHorizontal: spacing.tight,
  },
  metaText: {
    ...typography.rowSubtitle,
  },
  artworkSourceLine: {
    ...typography.micro,
    marginTop: spacing.xxs,
  },
  buttonRow: {
    marginBottom: spacing.xl,
  },
  secondaryButton: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  secondaryButtonDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});
