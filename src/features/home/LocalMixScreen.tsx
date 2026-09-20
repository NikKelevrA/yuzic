import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useScrollClearance } from '@/features/theme/useScrollClearance';
import { notify } from '@/components/toast';
import { ListMusic } from 'lucide-react-native';

import { DetailHeaderBar } from '@/components/DetailHeader';
import EmptyState from '@/components/EmptyState';
import SongRow from '@/components/rows/SongRow';
import LoadingSongRow from '@/components/rows/SongRow/Loading';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useTheme } from '@/features/theme/useTheme';
import { contentWidth, iconSize, spacing } from '@/constants/design';
import CollectionActions from '@/features/library/CollectionActions';
import { useLocalMix } from './hooks/useLocalMix';

/** Complete, playable view of Home's daily local-first mix. */
export default function LocalMixScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { playSongs } = usePlayingActions();
  // The list ended in a flat `spacing.xl`, which is a guess at the room the
  // playing bar needs and not one this screen can make: the bar's height moves
  // with the safe-area inset and with whether anything is playing, and under
  // the translucent dock the tabs take no layout space at all. The last track
  // sat behind both. This reads the real heights, as every other list does.
  const scrollClearance = useScrollClearance();
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

  /** A tapped row plays the whole mix from there, not that song alone. */
  const playFrom = useCallback(async (startIndex: number) => {
    if (!songs.length) return;
    try {
      await playSongs(songs, { startIndex, contextId: 'local-mix' });
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
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: scrollClearance }]}>
          <View style={styles.actions}>
            <CollectionActions
              onPlay={() => { void play(false); }}
              onShuffle={() => { void play(true); }}
            />
          </View>
          {/* `onPress` is what makes a row playable at all: `SongRow`
              disables itself when given neither a press handler nor a
              collection, so these were inert and only the shuffle button
              above worked (#264). The mix is neither an album nor a
              playlist, so it plays through `playSongs` — the same call the
              button makes, from the tapped song. */}
          {songs.map((song, index) => (
            <SongRow
              key={song.localId}
              song={song}
              onPress={() => { void playFrom(index); }}
            />
          ))}
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
  list: {
    width: '100%',
    maxWidth: contentWidth.readable,
    alignSelf: 'center',
  },
  actions: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.md },
});
