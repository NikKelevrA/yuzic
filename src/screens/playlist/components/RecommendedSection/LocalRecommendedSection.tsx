import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import IconActionButton from '@/components/IconActionButton';
import SectionHeader from '@/components/SectionHeader';
import { createAudiomuseQueueFillProvider } from '@/features/playback/queueProviders';
import { useApi } from '@/api';
import {
  useIsAudiomuseConfigured,
  useAudiomuseConfig,
} from '@/utils/redux/selectors/audiomuseSelectors';
import { useTracks } from '@/hooks/tracks';
import { useIsOffline } from '@/hooks/useIsOffline';
import { QueryKeys } from '@/enums/queryKeys';
import { iconSize, spacing } from '@/constants/design';
import seededShuffle from '@/utils/seededShuffle';
import {
  LOCAL_RECOMMENDED_COUNT,
  pickFallbackLocalSongs,
  playlistArtistNames as computePlaylistArtistNames,
} from '@/features/playlist/recommendedSongs';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { LocalRow } from './Rows';

type Props = {
  playlist: Playlist;
  songs: Song[];
  localSeed: number;
  onRefresh: () => void;
};

/**
 * Local-library recommendations: AudioMuse-AI similarity when configured,
 * falling back to a same-artist shuffle of the library — see
 * `recommendedSongs.ts` for the pure selection rules this builds from.
 */
export const LocalRecommendedSection: React.FC<Props> = ({ playlist, songs, localSeed, onRefresh }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { tracks } = useTracks();
  const api = useApi();
  const isOffline = useIsOffline();
  const isAudiomuseConfigured = useIsAudiomuseConfigured();
  const audiomuseConfig = useAudiomuseConfig();

  const playlistSongIds = useMemo(() => new Set(songs.map(s => s.localId)), [songs]);
  const playlistArtistNames = useMemo(() => computePlaylistArtistNames(songs), [songs]);

  // Same-artist shuffle from the local library — used whenever AudioMuse-AI
  // isn't configured, and as a safety net if its similarity call fails.
  const fallbackLocalSongs = useMemo<Song[]>(
    () => pickFallbackLocalSongs(tracks, playlistSongIds, playlistArtistNames, localSeed, LOCAL_RECOMMENDED_COUNT),
    [tracks, playlistSongIds, playlistArtistNames, localSeed]
  );

  // Reseed a handful of playlist tracks each refresh so acoustic similarity
  // results vary too, matching the fallback's shuffled feel.
  const audiomuseSeeds = useMemo(
    () => seededShuffle(songs, localSeed).slice(0, 5),
    [songs, localSeed]
  );

  const audiomuseQuery = useQuery({
    queryKey: [
      QueryKeys.RecommendedLocalSongs,
      'audiomuse',
      playlist.nativeId,
      audiomuseSeeds.map(s => s.nativeId).join(','),
    ],
    queryFn: () => createAudiomuseQueueFillProvider(audiomuseConfig, api).fetchExtension({
      recentSongs: audiomuseSeeds,
      excludeIds: playlistSongIds,
      count: LOCAL_RECOMMENDED_COUNT,
    }),
    enabled: isAudiomuseConfigured && !isOffline && audiomuseSeeds.length > 0,
    staleTime: 1000 * 60 * 30,
    networkMode: 'online',
  });

  const localSongs: Song[] = audiomuseQuery.data?.length ? audiomuseQuery.data : fallbackLocalSongs;

  if (localSongs.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader
        title={t('playlist.recommended.local')}
        action={
          <IconActionButton
            icon={<RefreshCw size={iconSize.row} color={colors.subtext} />}
            onPress={onRefresh}
            accessibilityLabel={t('playlist.recommended.refresh')}
            size="compact"
          />
        }
      />

      {localSongs.map(song => (
        <LocalRow key={song.localId} song={song} playlistId={playlist.nativeId} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    paddingTop: spacing.xl,
  },
});
