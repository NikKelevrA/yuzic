import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useRadius } from '@/features/theme/useRadius';
import { useTheme } from '@/features/theme/useTheme';

/** The trailing mark on a one-of-many option row: a ring, filled when chosen. */
export default function RadioMark({ selected }: { selected: boolean }) {
  const { colors } = useTheme();
  const rad = useRadius();
  return (
    <View
      style={[
        styles.outer,
        { borderColor: selected ? colors.secondary : colors.border, borderRadius: rad.pill },
      ]}
    >
      {selected && (
        <View style={[styles.inner, { backgroundColor: colors.secondary, borderRadius: rad.pill }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: 20,
    height: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 10,
    height: 10,
  },
});
