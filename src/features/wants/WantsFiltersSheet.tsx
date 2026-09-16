import React, { forwardRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { renderBackdrop } from '@/components/BottomSheetBackdrop';
import {
  OptionSheetRow,
  optionSheetStyles,
  useOptionSheetBackground,
  useOptionSheetContentStyle,
} from '@/components/options/OptionSheetPrimitives';
import { iconSize, spacing, typography } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';

export type WantsFilterOption = {
  value: string;
  label: string;
};

type Props = {
  selected: string;
  options: WantsFilterOption[];
  onSelect: (value: string) => void;
};

/**
 * Which kinds of want the list shows.
 *
 * A sheet rather than a row of chips, the way Search puts its filters behind
 * one control: the chips spent a whole line of the screen saying "All ·
 * Albums · Artists" above a list that is mostly one kind anyway, and grew
 * with every kind a want can be. The pill that opens this says what is
 * filtered, which is the part worth a line.
 *
 * Dismisses itself on a pick. A sheet that stays up after answering its own
 * question leaves the reader tapping the backdrop to get back to the list
 * they just filtered.
 */
const WantsFiltersSheet = forwardRef<BottomSheetModal, Props>(
  ({ selected, options, onSelect }, ref) => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const sheetBg = useOptionSheetBackground();
    const sheetContent = useOptionSheetContentStyle();

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        stackBehavior="push"
        backgroundStyle={[optionSheetStyles.sheetBackground, sheetBg]}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView testID="wants-filters-sheet" style={[sheetBg, sheetContent]}>
          <Text style={[styles.title, { color: colors.secondary }]}>
            {t('wants.filters.title')}
          </Text>
          {options.map(option => (
            <OptionSheetRow
              key={option.value}
              testID={`wants-filter-${option.value}`}
              label={option.label}
              onPress={() => onSelect(option.value)}
              trailing={
                option.value === selected
                  ? <Check size={iconSize.secondary} color={colors.themeColor} />
                  : undefined
              }
            />
          ))}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

WantsFiltersSheet.displayName = 'WantsFiltersSheet';

export default WantsFiltersSheet;

const styles = StyleSheet.create({
  title: {
    ...typography.rowTitle,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
});
