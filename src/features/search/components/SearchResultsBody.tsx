import React from 'react';
import SourceBadge from '@/components/SourceBadge';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { useTranslation } from 'react-i18next';

import { motion, spacing, typography } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import SkeletonListRow from '@/components/SkeletonListRow';
import { getSourceMeta } from '@/features/sources/registry';
import type { useSearchScreenModel } from '@/features/search/useSearchScreenModel';
import RecentSearches from './RecentSearches';
import SearchBrowse from '../browse/SearchBrowse';
import ResultRow from './results/ResultRow';

type Model = ReturnType<typeof useSearchScreenModel>;

/**
 * The scrollable body: recent searches when idle, a skeleton while loading,
 * or the results themselves — library rows in one flat list, "Other sources"
 * rows grouped under their source's own labelled header. Library and
 * external are never both on screen (`m.isOtherScope` picks exactly one),
 * the render-side half of the Library-XOR-Other-sources rule the fetch side
 * enforces in `planSearchLegs`.
 */
export default function SearchResultsBody({ m }: { m: Model }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const reduced = useReducedMotion();

  /**
   * Browse, recents, skeleton and results are four different bodies in one
   * scroll view, and the tab used to cut between them with nothing in
   * between — the screen simply became a different screen. They fade through
   * each other instead, rising a few points as they arrive, so moving
   * between the two states reads as one screen changing rather than two
   * screens swapping.
   *
   * `key` is what makes this work: Reanimated runs the exit animation only
   * when the element leaving and the element arriving are different nodes,
   * and without a key React reconciles them into one and animates nothing.
   */
  const branch = (key: string, children: React.ReactNode) => (
    <Animated.View
      key={key}
      entering={reduced
        ? FadeIn.duration(motion.quick)
        : FadeIn.duration(motion.contentFade).withInitialValues({ transform: [{ translateY: BRANCH_RISE }] })}
      exiting={FadeOut.duration(motion.quick)}
    >
      {children}
    </Animated.View>
  );

  /**
   * Nothing typed: browse, unless the tab is in its search state and there is
   * history to offer.
   *
   * Which of the two states the tab is in is `m.isSearching`, not the field's
   * focus — see `useSearchScreenModel`. Keying this on focus meant the body
   * changed out from under the reader every time the keyboard went away.
   *
   * Searching with no history yet keeps the browse tiles rather than
   * replacing them with a blank screen, which is what the old idle state did
   * to anyone who had not searched before.
   */
  if (m.query.trim() === '') {
    const hasHistory = m.recentQueries.length > 0 || m.recentEntities.length > 0;

    if (m.isSearching && hasHistory) {
      return branch('recents', (
        <RecentSearches
          queries={m.recentQueries}
          entities={m.recentEntities}
          onQueryPress={m.onRecentQueryPress}
          onEntityPress={m.onRecentEntityPress}
          onRemove={m.onRemoveRecent}
          onClear={m.onClearRecent}
        />
      ));
    }

    return branch('browse', <SearchBrowse />);
  }

  if (m.isLoading) {
    return branch('loading', <>{[...Array(8)].map((_, i) => <SkeletonListRow key={i} />)}</>);
  }

  const row = (result: Parameters<typeof ResultRow>[0]['result']) => (
    <ResultRow
      result={result}
      activeServerId={m.activeServerId}
      navigation={m.navigation}
      navigateToAlbum={m.navigateToAlbum}
      navigateToArtist={m.navigateToArtist}
      onSelect={m.selectResult}
      onSongPress={m.onSongPress}
      onSongOptions={m.onSongOptions}
    />
  );

  return branch('results', (
    <>
      {!m.isOtherScope && m.libraryResults.map(result => (
        <View key={`local:${result.type}:${result.id}`} style={styles.resultBlock}>
          {row(result)}
        </View>
      ))}

      {m.isOtherScope && Array.from(m.externalResultsBySource.entries()).map(([sourceId, results]) => {
        const meta = getSourceMeta(sourceId);
        const label = meta?.label ?? sourceId;
        const color = meta?.color ?? colors.subtext;
        const letter = label.charAt(0).toUpperCase();
        return (
          <React.Fragment key={sourceId}>
            <View style={styles.sourceHeader}>
              {m.showSourceHeaders && (
                <SourceBadge letter={letter} color={color} />
              )}
              <Text style={[styles.sourceHeaderText, { color: colors.subtext }]}>{label}</Text>
            </View>
            {results.map((result, i) => (
              <View key={`external:${result.type}:${result.id}`} style={[styles.resultBlock, i === 0 && styles.resultBlockFirst]}>
                {row(result)}
              </View>
            ))}
          </React.Fragment>
        );
      })}

      {m.noResultsForScope && (
        <Text testID="search-no-results" style={[styles.noResults, { color: colors.subtext }]}>
          {t('search.noResults')}
        </Text>
      )}
    </>
  ));
}

/** How far a body rises as it fades in — enough to read as arrival, not as travel. */
const BRANCH_RISE = 8;

const styles = StyleSheet.create({
  resultBlock: {},
  resultBlockFirst: {
    paddingTop: spacing.sm,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.roomy,
    paddingBottom: spacing.xs,
  },
  sourceHeaderText: {
    ...typography.rowSubtitle,
    fontWeight: '500',
  },
  noResults: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
