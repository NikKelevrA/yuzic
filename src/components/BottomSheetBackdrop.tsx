import React, { useEffect } from 'react';
import { BackHandler } from 'react-native';
import {
  BottomSheetBackdrop as GorhomBackdrop,
  BottomSheetBackdropProps,
  useBottomSheet,
} from '@gorhom/bottom-sheet';

/**
 * The backdrop every sheet shares, and so the one place that can give every
 * sheet Android's back button. Without it back went to the screen underneath —
 * the tab changed and the sheet stayed on top of the new one.
 *
 * The backdrop exists exactly while its sheet is mounted, so it registers for
 * as long as it is. Back handlers run newest first, so the sheet opened last
 * closes first, and a sheet over the full player closes before the player
 * collapses. One that is already closing lets back pass through.
 */
function Backdrop(props: BottomSheetBackdropProps) {
  const { close } = useBottomSheet();
  const { animatedIndex } = props;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (animatedIndex.value < 0) return false;
      close();
      return true;
    });
    return () => subscription.remove();
  }, [animatedIndex, close]);

  return (
    <GorhomBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      pressBehavior="close"
    />
  );
}

export const renderBackdrop = (props: BottomSheetBackdropProps) => <Backdrop {...props} />;
