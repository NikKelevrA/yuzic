import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { Ellipsis, Search } from 'lucide-react-native';

import { DetailHeaderBar } from '@/components/DetailHeader';
import MediaListRow from '@/components/MediaListRow';
import EmptyState from '@/components/EmptyState';
import Touchable from '@/components/Touchable';
import { WantOptions } from '@/components/options/WantOptions';
import { useTheme } from '@/features/theme/useTheme';
import { useScrollClearance } from '@/features/theme/useScrollClearance';
import { hitSlopFor, iconSize, spacing } from '@/constants/design';
import { selectWantsForActiveServer } from '@/state/redux/selectors/wantsSelectors';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { removeWant, type Want } from '@/state/redux/slices/wantsSlice';

/**
 * Wants library screen: the save-only wishlist for tracks/albums nothing has
 * resolved yet. Works with zero downloaders connected — a Want is just a
 * saved intent (title/artist), and acquisition (a Get) is a separate,
 * later action, never triggered from here.
 *
 * Wants are created by saving a *resolved* result — from Search or a song's
 * options — so this screen has no add control of its own. The empty state
 * points at Search, the one place a want is born with real metadata; a
 * free-text "type a title" box would only manufacture unmatchable rows.
 *
 * It reads as a library list rather than a settings page: the shared detail
 * bar with the count every other collection shows, and a row whose "…" carries
 * what you can do with one want. It used to wear the Settings header and put
 * its only action — remove — behind a bare "×".
 */
const WantsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch();
  const scrollClearance = useScrollClearance();
  const wants = useSelector(selectWantsForActiveServer);
  const activeServerId = useSelector(selectActiveServerId);
  const [optionsFor, setOptionsFor] = useState<Want | null>(null);

  const handleRemove = useCallback((want: Want) => {
    if (!activeServerId) return;
    dispatch(removeWant({ serverId: activeServerId, localId: want.localId }));
  }, [dispatch, activeServerId]);

  const goToSearch = useCallback(() => {
    router.navigate('/(home)/(tabs)/(search)');
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: Want }) => (
      <MediaListRow
        testID="want-row"
        title={item.title}
        subtitle={item.artist}
        cover={{ kind: 'none' }}
        trailing={
          <Touchable
            testID="want-options"
            accessibilityRole="button"
            accessibilityLabel={t('a11y.rows.options', { title: item.title })}
            hitSlop={hitSlopFor(iconSize.row)}
            onPress={() => setOptionsFor(item)}
            style={styles.optionsButton}
            feedback="control"
          >
            <Ellipsis size={iconSize.row} color={colors.subtext} />
          </Touchable>
        }
      />
    ),
    [colors.subtext, t]
  );

  return (
    <SafeAreaView testID="wants-screen" edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <DetailHeaderBar
        title={t('wants.title')}
        subtitle={wants.length > 0 ? t('library.count.items', { count: wants.length }) : undefined}
      />
      {wants.length === 0 ? (
        <EmptyState
          icon={<Search size={iconSize.emptyState} color={colors.subtext} />}
          message={t('wants.empty')}
          action={{ label: t('wants.searchAction'), onPress: goToSearch }}
        />
      ) : (
        <FlatList
          data={wants}
          keyExtractor={(item) => item.localId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: scrollClearance }}
        />
      )}

      {optionsFor && (
        <WantOptions
          want={optionsFor}
          onClose={() => setOptionsFor(null)}
          onSearch={goToSearch}
          onRemove={() => handleRemove(optionsFor)}
        />
      )}
    </SafeAreaView>
  );
};

export default WantsScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  optionsButton: {
    padding: spacing.sm,
  },
});
