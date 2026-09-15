import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { notify } from '@/components/toast';
import { ListMusic } from 'lucide-react-native';

import { DetailHeaderBar } from '@/components/DetailHeader';
import EmptyState from '@/components/EmptyState';
import SongRow from '@/components/rows/SongRow';
import LoadingSongRow from '@/components/rows/SongRow/Loading';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize, spacing } from '@/constants/design';
import CollectionActions from '@/features/library/CollectionActions';
import { useLocalMix } from './hooks/useLocalMix';

/** Complete, playable view of Home's daily local-first mix. */
export default function LocalMixScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { playSongs } = usePlayingActions();
  const { refreshKey: rawRefreshKey } = useLocalSearchParams<{ refreshKey?: string }>();
  const refreshKey = Number.parseInt(rawRefreshKey ?? '0', 10) || 0;
  const { songs, isLoading } = useLocalMix(refreshKey);

  const play = useCallback(async (shuffle: boolean) => {
    if (!songs.length) return;
    try {
      await playSongs(songs, { shuffle, contextId: 'local-mix' });
    } catch {
      notify.error(t('library.collection.playFailed'));
    }
  }, [playSongs, songs, t]);

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: colors.background }]}>
      <DetailHeaderBar
        title={t('explore.sections.localMix')}
        subtitle={songs.length ? t('library.count.items', { count: songs.length }) : undefined}
      />
      {isLoading ? (
        <View style={styles.list}>
          {Array.from({ length: 6 }).map((_, index) => <LoadingSongRow key={index} />)}
        </View>
      ) : songs.length ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.actions}>
            <CollectionActions
              onPlay={() => { void play(false); }}
              onShuffle={() => { void play(true); }}
            />
          </View>
          {songs.map(song => <SongRow key={song.localId} song={song} />)}
        </ScrollView>
      ) : (
        <EmptyState
          icon={<ListMusic size={iconSize.emptyState} color={colors.subtext} />}
          message={t('library.collection.empty')}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: spacing.xl },
  actions: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
