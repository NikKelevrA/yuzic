import React from 'react';
import { ScrollView, StyleSheet, Platform, ViewStyle, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/features/theme/useTheme';
import Header from './Header';
import { spacing } from '@/constants/design';
import { useScrollClearance } from '@/features/theme/useScrollClearance';

type Props = {
  title: string;
  children: React.ReactNode;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  scrollContentStyle?: ViewStyle;
  /** For a screen that scrolls itself, e.g. to a section it was opened for. */
  scrollRef?: React.Ref<ScrollView>;
  /**
   * Replaces the page's ScrollView. A screen holding reorderable lists passes
   * `SourceListScrollContainer`: a plain ScrollView loses every vertical swipe
   * that starts on one of them to the list's drag gesture, so the page only
   * scrolled from the gaps between. Passed in rather than imported here, so
   * the drag library loads only on the screen that uses it.
   */
  scrollContainer?: React.ComponentType<ScrollViewProps>;
};

const SettingsScreen: React.FC<Props> = ({
  title,
  children,
  onBackPress,
  rightAction,
  scrollContentStyle,
  scrollRef,
  scrollContainer: ScrollContainer,
}) => {
  const { colors } = useTheme();
  const scrollClearance = useScrollClearance();

  return (
    <SafeAreaView
      // Top only, like every other screen. The default is all four edges, and
      // the bottom one paints the home-indicator inset as a dead black band
      // between the last card and the playing bar — the dock is a real docked
      // tabBar that already owns that space, so claiming it twice just leaves
      // a strip of background no content can reach.
      edges={['top']}
      style={[
        styles.container,
        { backgroundColor: colors.background },
        Platform.OS === 'android' && { paddingTop: spacing.xl },
      ]}
    >
      <Header title={title} onBackPress={onBackPress} rightAction={rightAction} />
      {ScrollContainer ? (
        <ScrollContainer contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollClearance }, scrollContentStyle]}>
          {children}
        </ScrollContainer>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollClearance },
            scrollContentStyle,
          ]}
        >
          {children}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    padding: spacing.lg,
  },
});
