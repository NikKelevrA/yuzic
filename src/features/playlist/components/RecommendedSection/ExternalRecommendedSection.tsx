import React, { useCallback, useMemo, useState } from 'react';
import SourceBadge from '@/components/SourceBadge';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { notify } from '@/components/toast';

import { useTheme } from '@/features/theme/useTheme';
import { useIconSize } from '@/features/theme/useIconSize';
import IconActionButton from '@/components/IconActionButton';
import SectionHeader from '@/components/SectionHeader';
import SkeletonListRow from '@/components/SkeletonListRow';
import GetReviewSheet from '@/components/options/GetReviewSheet';
import { useSheetRef } from '@/components/useSheetRef';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useAnyAlbumDownloaderConnected } from '@/features/downloaders/registry';
import { selectShowSourceHeaders } from '@/features/settings/appearance/state';
import { selectSourceUse } from '@/features/settings/sources/state';
import {
  CATALOGUE_SIMILAR_USE,
  CATALOGUE_TRACKS_RECOMMENDATIONS_USE,
  fetchCatalogueAlbum,
  fetchPlaylistRecommendations,
  SCROBBLES_AVAILABLE,
  SCROBBLES_SIMILAR_USE,
  type SimilarArtistSources,
} from '@/providers/registry/pageSources';
import { ARTIST_CATALOGUE } from '@/providers/registry/artistSources';
import { QueryKeys } from '@/state/query/queryKeys';
import { spacing, typography } from '@/constants/design';
import { playlistArtistNames as computePlaylistArtistNames } from '@/features/playlist/recommendedSongs';
import type { Album } from '@/domain/entities/Album';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { ExternalRow } from './Rows';

type Props = {
  playlist: Playlist;
  songs: Song[];
  onRefreshExternal: () => void;
};

/**
 * Tracks to go with a playlist, from the artists already in it.
 *
 * Two questions, and they are not the same one. "Who sounds like this" is the
 * `similarArtists` purpose, which Last.fm or Deezer can answer — whichever the
 * user has turned on there, rather than a switch of this row's own asking the
 * same thing again. "What can I play by them" only a catalogue can answer, so
 * that one is required.
 *
 * It used to name Last.fm for the first question and demand a switch of its
 * own for it, which meant the row needed a key the shipped builds do not carry
 * — so it has never appeared in one. Deezer alone is enough now.
 */
export const ExternalRecommendedSection: React.FC<Props> = ({ playlist, songs, onRefreshExternal }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const icons = useIconSize();
  const showSourceHeaders = useSelector(selectShowSourceHeaders);
  const isOffline = useIsOffline();
  const catalogueEnabled = useSelector(selectSourceUse(CATALOGUE_TRACKS_RECOMMENDATIONS_USE));
  // The seed step reads the `similarArtists` switches — the same ones the
  // artist page reads, so turning a source on there turns it on here too.
  const scrobblesSimilar = useSelector(selectSourceUse(SCROBBLES_SIMILAR_USE)) && SCROBBLES_AVAILABLE;
  const catalogueSimilar = useSelector(selectSourceUse(CATALOGUE_SIMILAR_USE));
  const hasDownloader = useAnyAlbumDownloaderConnected();
  const downloadSheetRef = useSheetRef();
  const [albumForDownload, setAlbumForDownload] = useState<Album | null>(null);

  const playlistArtistNames = useMemo(() => computePlaylistArtistNames(songs), [songs]);

  const externalQueryKey = useMemo(
    () => [QueryKeys.RecommendedExternalSongs, 'playlist', playlist.nativeId, playlistArtistNames.join(',')],
    [playlist.nativeId, playlistArtistNames]
  );

  const similarSources = useMemo<SimilarArtistSources>(
    () => ({ scrobbles: scrobblesSimilar, catalogue: catalogueSimilar }),
    [scrobblesSimilar, catalogueSimilar]
  );
  // Somewhere to start and somewhere to look the results up: any one seed
  // source will do, the catalogue is not optional.
  const canRecommend = catalogueEnabled && (scrobblesSimilar || catalogueSimilar);

  const externalQuery = useQuery({
    queryKey: externalQueryKey,
    queryFn: () => fetchPlaylistRecommendations(playlistArtistNames, similarSources),
    enabled:
      canRecommend &&
      !isOffline &&
      playlistArtistNames.length > 0,
    staleTime: 1000 * 60 * 60 * 6,
    networkMode: 'online',
  });

  const handleDownloadExternalSong = useCallback(async (song: Song) => {
    if (!hasDownloader) return;
    if (!song.album.nativeId) {
      notify.error(t('externalAlbum.download.startFailed'));
      return;
    }

    try {
      const album = await fetchCatalogueAlbum(song.album.nativeId);
      if (!album) {
        notify.error(t('externalAlbum.download.startFailed'));
        return;
      }

      setAlbumForDownload(album);
      requestAnimationFrame(() => {
        downloadSheetRef.current?.present();
      });
    } catch {
      notify.error(t('externalAlbum.download.startFailed'));
    }
  }, [downloadSheetRef, hasDownloader, t]);

  if (!canRecommend || isOffline || playlistArtistNames.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('playlist.recommended.catalogueTitle')}
        badge={
          showSourceHeaders ? (
            <SourceBadge letter={ARTIST_CATALOGUE.badge.letter} color={ARTIST_CATALOGUE.badge.color} />
          ) : undefined
        }
        action={
          <IconActionButton
            icon={<RefreshCw size={icons.row} color={colors.subtext} />}
            onPress={onRefreshExternal}
            loading={externalQuery.isFetching}
            accessibilityLabel={t('playlist.recommended.refresh')}
            size="compact"
          />
        }
      />

      {externalQuery.isLoading ? (
        // Rows rather than a spinner: this is loading a list, and the
        // placeholder should keep the shape the list is about to take.
        <View style={styles.loader}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonListRow key={`recommended-loading-${index}`} />
          ))}
        </View>
      ) : (externalQuery.data ?? []).length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.placeholder }]}>
          {t('playlist.recommended.externalEmpty')}
        </Text>
      ) : (
        (externalQuery.data ?? []).map(song => (
          <ExternalRow
            key={song.localId}
            song={song}
            hasDownloader={hasDownloader}
            onDownload={handleDownloadExternalSong}
          />
        ))
      )}

      {albumForDownload && (
        <GetReviewSheet
          album={albumForDownload}
          sheetRef={downloadSheetRef}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xl,
  },
  sourceBadge: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginVertical: spacing.xl },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.roomy,
  },
});
