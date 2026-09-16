import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';

import { renderBackdrop } from '@/components/BottomSheetBackdrop';
import { useSheetRef } from '@/components/useSheetRef';
import {
  OptionSheetRow,
  optionSheetStyles,
  useOptionSheetBackground,
  useOptionSheetContentStyle,
} from '@/components/options/OptionSheetPrimitives';
import { iconSize, spacing, typography } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';

export type WantsPickOption = {
  value: string;
  label: string;
  Icon?: React.ComponentType<{ size: number; color: string }>;
};

type Props = {
  title: string;
  selected: string;
  options: WantsPickOption[];
  onSelect: (value: string) => void;
  onClose: () => void;
  testID?: string;
};

/**
 * Pick one option — which kinds of want to show, or how to order them.
 *
 * **Mounted only while it is open, and it presents itself**, which is the
 * pattern every options sheet in this app already follows
 * (`WantOptions`, `RadioStationOptions`). Held mounted the whole time
 * instead, a sheet on this screen would begin dismissing on a backdrop tap
 * and then snap back open: Wants re-renders behind it — it reads the library
 * index and the downloader queue to say what each row's status is — and a
 * live modal re-measuring mid-animation cancels its own dismissal. Unmounting
 * on close means there is nothing left to resurrect.
 *
 * `onClose` fires on dismissal however it happened — backdrop, pan-down, or a
 * pick — so the screen drops it and the next open is a fresh mount.
 */
function WantsPickSheet({
  title,
  selected,
  options,
  onSelect,
  onClose,
  testID,
}: Props) {
  const { colors } = useTheme();
  const sheetRef = useSheetRef();
  const sheetBg = useOptionSheetBackground();
  const sheetContent = useOptionSheetContentStyle();

  useEffect(() => { sheetRef.current?.present(); }, [sheetRef]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      stackBehavior="push"
      backgroundStyle={[optionSheetStyles.sheetBackground, sheetBg]}
      handleIndicatorStyle={{ backgroundColor: colors.border }}
      onChange={index => { if (index === -1) onClose(); }}
    >
      <BottomSheetView testID={testID} style={[sheetBg, sheetContent]}>
        <Text style={[styles.title, { color: colors.secondary }]}>{title}</Text>
        {options.map(option => (
          <OptionSheetRow
            key={option.value}
            testID={`wants-pick-${option.value}`}
            label={option.label}
            icon={
              option.Icon
                ? <option.Icon size={iconSize.row} color={colors.subtext} />
                : undefined
            }
            // Dismiss first, then answer: the list being reordered or filtered
            // is behind the sheet, and a sheet that stays up after answering
            // its own question leaves the reader tapping the backdrop.
            onPress={() => {
              sheetRef.current?.dismiss();
              onSelect(option.value);
            }}
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

/**
 * Memoised, and every prop it is given is stable — see `WantsScreen`.
 *
 * Wants re-renders on every downloader poll: the queue snapshot is rebuilt
 * unconditionally, so the context value changes and this screen with it. A
 * live `BottomSheetModal` re-rendered mid-dismiss re-measures its own content
 * under `enableDynamicSizing` and cancels the dismissal, which is a sheet that
 * starts to close and springs straight back open. It never remounted — one
 * mount, no unmount, a re-render per poll — so keeping the element identical
 * across those renders is the whole fix.
 */
export default React.memo(WantsPickSheet);

const styles = StyleSheet.create({
  title: {
    ...typography.rowTitle,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
});
