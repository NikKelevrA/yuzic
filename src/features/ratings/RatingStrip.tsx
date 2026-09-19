import React, { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, typography } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';
import StarRating from './StarRating';
import { useRating, useSetRating } from './useRatings';
import { useRatingsAvailable } from './useRatingsAvailable';

type Rateable = { nativeId: string; userRating?: number };

/**
 * The rating row an options sheet carries, under the title of the thing the
 * sheet is about.
 *
 * Above the actions rather than among them, because it is not one: an action
 * row does something when pressed, and a row whose only live parts are five
 * small targets on its right-hand side is a row that does nothing when a
 * finger lands anywhere else on it. The sheet's own actions stay a list of
 * things that happen.
 *
 * Renders nothing where the server has no ratings, so every caller can pass
 * it unconditionally.
 */
const RatingStrip: React.FC<{ entity: Rateable | null | undefined }> = ({ entity }) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const available = useRatingsAvailable();
  const rating = useRating(entity);
  const setRating = useSetRating();
  const nativeId = entity?.nativeId;

  const change = useCallback(
    (next: number) => { if (nativeId) void setRating(nativeId, next); },
    [setRating, nativeId]
  );

  if (!available || !nativeId) return null;

  return (
    <View style={styles.strip}>
      <Text style={[styles.label, { color: colors.secondary }]}>{t('ratings.label')}</Text>
      <StarRating value={rating} onChange={change} />
    </View>
  );
};

export default RatingStrip;

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.roomy,
    paddingTop: spacing.md,
  },
  label: {
    ...typography.rowSubtitle,
  },
});
