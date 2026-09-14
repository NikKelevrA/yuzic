import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { useQuery } from '@tanstack/react-query';
import { notify } from '@/components/toast';

import { useTheme } from '@/features/theme/useTheme';
import { useRadius } from '@/features/theme/useRadius';
import IconActionButton from '@/components/IconActionButton';
import SectionHeader from '@/components/SectionHeader';
import SkeletonListRow from '@/components/SkeletonListRow';
import GetReviewSheet from '@/components/options/GetReviewSheet';
import { useSheetRef } from '@/components/useSheetRef';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useAnyAlbumDownloaderConnected } from '@/features/downloaders/registry';
import { selectShowSourceHeaders } from '@/features/settings/appearance/state';
import { selectDeezerDiscoveryEnabled } from '@/features/settings/home/state';
import { selectLastfmEnabled } from '@/features/settings/metadata/state';
import * as deezer from '@/providers/integration/deezer';
import { getLastFmSimilarArtists } from '@/providers/integration/lastfm/getSimilarArtists';
import { LASTFM_API_KEY } from '@/constants/keys';
import { QueryKeys } from '@/state/query/queryKeys';
import { iconSize, onDark, sourceColor, spacing, typography } from '@/constants/design';
import shuffleArray from '@/features/playback/shuffleArray';
import { playlistArtistNames as computePlaylistArtistNames } from '@/features/playlist/recommendedSongs';
import type { Album } from '@/domain/entities/Album';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { ExternalRow } from './Rows';

const EXTERNAL_COUNT = 8;

/**
 * Last.fm expands the seed artists into similar ones, Deezer turns those
 * into playable tracks. Two round trips, deliberately independent of any
 * particular playlist: a caller with no `LASTFM_API_KEY` bundled, or no seed
 * artists, gets `[]` rather than an error — this is a discovery rail, not a
 * critical path. Kept in this file (rather than the provider-free
 * `recommendedSongs.ts`) so the Deezer/Last.fm names it references stay
 * confined to the one file that already named them.
 */
async function fetchExternalRecs(artistNames: string[]): Promise<Song[]> {
  if (!artistNames.length || !LASTFM_API_KEY) return [];

  try {
    const similarResults = await Promise.all(
      artistNames.map(name => getLastFmSimilarArtists(LASTFM_API_KEY, name, 15))
    );

    const seen = new Set<string>(artistNames.map(n => n.toLowerCase()));
    const candidates: string[] = [];
    for (const similar of similarResults) {
      for (const s of shuffleArray(similar)) {
        if (candidates.length >= artistNames.length * 8) break;
        const key = s.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(s.name);
        }
      }
    }

    const shuffledCandidates = shuffleArray(candidates);
    const trackGroupResults = await Promise.allSettled(
      shuffledCandidates.map(async name => {
        const artist = await deezer.resolveDeezerArtistByName(name);
        if (!artist) return [] as Song[];
        return deezer.getDeezerArtistTopTracks(artist.nativeId, 2);
      })
    );
    const trackGroups = trackGroupResults
      .filter((r): r is PromiseFulfilledResult<Song[]> => r.status === 'fulfilled')
      .map(r => r.value);

    const seenIds = new Set<string>();
    const tracks: Song[] = [];
    const groups = shuffleArray(trackGroups.filter(group => group.length > 0));

    for (let trackIndex = 0; trackIndex < 2; trackIndex++) {
      for (const group of groups) {
        if (tracks.length >= EXTERNAL_COUNT) break;
        const track = group[trackIndex];
        if (!track) continue;
        if (!seenIds.has(track.nativeId)) {
          seenIds.add(track.nativeId);
          tracks.push(track);
        }
      }
      if (tracks.length >= EXTERNAL_COUNT) break;
    }

    for (const group of groups) {
      if (tracks.length >= EXTERNAL_COUNT) break;
      for (const track of group) {
        if (tracks.length >= EXTERNAL_COUNT) break;
        if (!seenIds.has(track.nativeId)) {
          seenIds.add(track.nativeId);
          tracks.push(track);
        }
      }
    }

    return tracks;
  } catch {
    return [];
  }
}

type Props = {
  playlist: Playlist;
  songs: Song[];
  onRefreshExternal: () => void;
};

/**
 * Deezer/Last.fm discovery: Last.fm expands the playlist's own artists into
 * similar ones, Deezer turns those into playable preview tracks — see
 * `recommendedSongs.fetchExternalRecs`.
 */
export const ExternalRecommendedSection: React.FC<Props> = ({ playlist, songs, onRefreshExternal }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();
  const showSourceHeaders = useSelector(selectShowSourceHeaders);
  const isOffline = useIsOffline();
  const deezerEnabled = useSelector(selectDeezerDiscoveryEnabled);
  const lastfmEnabled = useSelector(selectLastfmEnabled);
  const hasDownloader = useAnyAlbumDownloaderConnected();
  const downloadSheetRef = useSheetRef();
  const [albumForDownload, setAlbumForDownload] = useState<Album | null>(null);

  const playlistArtistNames = useMemo(() => computePlaylistArtistNames(songs), [songs]);

  const externalQueryKey = useMemo(
    () => [QueryKeys.RecommendedExternalSongs, 'playlist', playlist.nativeId, playlistArtistNames.join(',')],
    [playlist.nativeId, playlistArtistNames]
  );

  const externalQuery = useQuery({
    queryKey: externalQueryKey,
    queryFn: () => fetchExternalRecs(playlistArtistNames),
    // This row is two services in a trench coat: Last.fm expands the seed
    // artists into similar ones, Deezer turns those into playable tracks. It
    // needs both to have been turned on — plus a bundled Last.fm key to
    // expand with — so it asks for all three before calling anyone.
    enabled:
      deezerEnabled &&
      lastfmEnabled &&
      !isOffline &&
      playlistArtistNames.length > 0 &&
      Boolean(LASTFM_API_KEY),
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
      const detail = await deezer.getDeezerAlbum(song.album.nativeId);
      if (!detail) {
        notify.error(t('externalAlbum.download.startFailed'));
        return;
      }

      setAlbumForDownload(detail.album);
      requestAnimationFrame(() => {
        downloadSheetRef.current?.present();
      });
    } catch {
      notify.error(t('externalAlbum.download.startFailed'));
    }
  }, [downloadSheetRef, hasDownloader, t]);

  if (!deezerEnabled || !lastfmEnabled || isOffline || playlistArtistNames.length === 0 || !LASTFM_API_KEY) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('playlist.recommended.deezerTitle')}
        badge={
          showSourceHeaders ? (
            <View style={[styles.sourceBadge, styles.sourceBadgeDeezer, { borderRadius: rad.pill }]}>
              <Text style={styles.sourceBadgeLetter}>D</Text>
            </View>
          ) : undefined
        }
        action={
          <IconActionButton
            icon={<RefreshCw size={iconSize.row} color={colors.subtext} />}
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
  sourceBadgeDeezer: {
    backgroundColor: sourceColor.deezer,
  },
  sourceBadgeLetter: {
    ...typography.micro,
    fontWeight: '600',
    color: onDark.text,
  },
  loader: { marginVertical: spacing.xl },
  emptyText: {
    ...typography.caption,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.roomy,
  },
});
