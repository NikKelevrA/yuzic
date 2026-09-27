import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/Text';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme/useTheme';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import Touchable from '@/components/Touchable';
import UserAvatar from '@/components/UserAvatar';
import { controlSize, hitSlopFor, iconSize, motion, spacing, typography } from '@/constants/design';
import { useRadius } from '@/features/theme/useRadius';

/** Header shared by the Home, Library and Search tabs: screen title plus the
 * account avatar. */
type Props = {
  title: string;
  username?: string;
  onAccountPress: () => void;
  /**
   * Takes the avatar's place while it is set, crossfading with it.
   *
   * This slot exists because the Search tab needs somewhere to put Cancel and
   * the row below it has none: the field and the Filters button already fill
   * that width, and squeezing a third control in shrank the field on every
   * phone. The header row, meanwhile, has one control and a title. The avatar
   * is also the right thing to give up — reaching for your account is not
   * something you do mid-search, and it comes straight back on Cancel.
   */
  action?: { label: string; onPress: () => void; testID?: string };
};

export default function TabHeader({ title, username, onAccountPress, action }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();
  const reduced = useReducedMotion();

  // A slide would be motion for its own sake here; the two controls are
  // different widths, so they cross rather than travel. Under reduced motion
  // the pair still fades, just fast enough not to read as movement.
  const fadeIn = FadeIn.duration(reduced ? motion.quick : motion.modeChange);
  const fadeOut = FadeOut.duration(reduced ? motion.quick : motion.quick);

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.secondary }]}>{title}</Text>

      <View style={styles.actions}>
        {action ? (
          <Animated.View key="action" entering={fadeIn} exiting={fadeOut}>
            <Touchable
              testID={action.testID}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={styles.action}
              hitSlop={hitSlopFor(iconSize.large)}
              onPress={action.onPress}
            >
              <Text style={[styles.actionText, { color: colors.themeColor }]}>{action.label}</Text>
            </Touchable>
          </Animated.View>
        ) : (
          <Animated.View key="avatar" entering={fadeIn} exiting={fadeOut}>
            <Touchable
              accessibilityLabel={t('a11y.account')}
              accessibilityRole="button"
              style={styles.avatar}
              onPress={onAccountPress}
              hitSlop={hitSlopFor(iconSize.large)}
            >
              <UserAvatar username={username} size={controlSize.avatarTabHeader} borderRadius={rad.pill} />
            </Touchable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    // The avatar and a word of text are different heights, and the row would
    // otherwise resize as they swap, nudging the search field below it.
    minHeight: controlSize.avatarTabHeader + spacing.md * 2,
  },
  title: {
    ...typography.screenTitle,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginLeft: spacing.md,
  },
  action: {
    marginLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  actionText: {
    ...typography.button,
  },
});
