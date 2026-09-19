import React from 'react';
import { View, StyleSheet, type AccessibilityRole, type ViewStyle } from 'react-native';
import { useTheme } from '@/features/theme/useTheme';
import { spacing } from '@/constants/design';
import { useRadius } from '@/features/theme/useRadius';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  /**
   * For a card that is a set of choices rather than a list of settings.
   *
   * A picker's rows are radios, and a radio outside a `radiogroup` is a
   * control a screen reader cannot tell you the extent of — "selected" with
   * no "one of three".
   */
  accessibilityRole?: AccessibilityRole;
};

const SettingsCard: React.FC<Props> = ({ children, style, accessibilityRole }) => {
  const { colors } = useTheme();
  const rad = useRadius();
  return (
    <View
      accessibilityRole={accessibilityRole}
      style={[styles.card, { backgroundColor: colors.card, borderRadius: rad.card }, style]}
    >
      {children}
    </View>
  );
};

export default SettingsCard;

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
});
