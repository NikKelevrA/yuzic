import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import Touchable from '@/components/Touchable';
import { hitSlopFor, iconSize, spacing } from '@/constants/design';
import { RATING_MAX } from '@/domain/entities/Rating';
import { useTheme } from '@/features/theme/useTheme';

type Props = {
  /** 0–5, or undefined where the server carries no rating for this. */
  value: number | undefined;
  /** Given the new rating. Tapping the star already set passes 0. */
  onChange: (rating: number) => void;
  /** The colour of a filled star; defaults to the user's accent. */
  color?: string;
  /** The colour of an empty one. */
  emptyColor?: string;
  size?: number;
  disabled?: boolean;
  /**
   * Names each star for E2E, given its number.
   *
   * The caller builds the id rather than this component fixing one, because
   * the player's stars and the sheet's can both be mounted at once — the
   * sheet opens over the player — and two elements answering to one id is a
   * flow that taps whichever Maestro finds first. Only the sheet passes it.
   *
   * Named to *end* in `testID`, which is the shape `.maestro/testIds.test.ts`
   * looks for when it checks that every id a flow reaches for exists.
   */
  starTestID?: (star: number) => string;
};

const STARS = Array.from({ length: RATING_MAX }, (_, index) => index + 1);

/**
 * Five stars the user taps to rate something.
 *
 * Tapping the star that is already the rating clears it, which is the only
 * way to take a rating off — there is no sixth control for "unrate", and a
 * scale whose lowest value is one star cannot express "I have not decided".
 * It is also what every other five-star control does, so nobody has to be
 * told.
 *
 * Five radio buttons to a screen reader rather than one adjustable value:
 * the rating is a choice between six states, exactly one of which holds, and
 * `checked` on a radio is how that is already spelled. An adjustable would
 * have been one control the user has to discover the increments of.
 *
 * Colours are passed in rather than read here. The same control is drawn on a
 * themed sheet and on the player, whose background is dark whatever the
 * theme, and a component that reads the theme itself would be right on one of
 * them.
 */
const StarRating: React.FC<Props> = ({
  value,
  onChange,
  color,
  emptyColor,
  size = iconSize.control,
  disabled = false,
  starTestID,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const filled = color ?? colors.themeColor;
  const empty = emptyColor ?? colors.border;
  const rating = value ?? 0;
  const slop = useMemo(() => hitSlopFor(size), [size]);

  return (
    <View
      style={styles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('a11y.rating.label')}
    >
      {STARS.map(star => (
        <Touchable
          key={star}
          testID={starTestID?.(star)}
          feedback="control"
          disabled={disabled}
          accessibilityRole="radio"
          accessibilityState={{ checked: star === rating, disabled }}
          accessibilityLabel={t('a11y.rating.star', { count: star })}
          hitSlop={slop}
          style={styles.star}
          onPress={() => onChange(star === rating ? 0 : star)}
        >
          <Star
            size={size}
            color={star <= rating ? filled : empty}
            fill={star <= rating ? filled : 'none'}
          />
        </Touchable>
      ))}
    </View>
  );
};

export default StarRating;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.inlineGap,
  },
  star: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
