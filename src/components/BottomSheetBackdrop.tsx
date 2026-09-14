import React, { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
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
 * It listens only while its sheet is open. Whether it is open comes from the
 * sheet's animated index, followed on the UI thread and handed to JS when it
 * crosses closed/open: reading `animatedIndex.value` from the back handler
 * itself could still see -1 on a sheet that had just opened, so the first back
 * press after launch went through to the screen instead. Handlers run newest
 * first, so the sheet opened last closes first, and a sheet over the full
 * player closes before the player collapses.
 */
function Backdrop(props: BottomSheetBackdropProps) {
  const { close } = useBottomSheet();
  const { animatedIndex } = props;
  const [isOpen, setIsOpen] = useState(false);

  useAnimatedReaction(
    () => animatedIndex.value >= 0,
    (open, previous) => {
      if (open !== previous) runOnJS(setIsOpen)(open);
    },
    [animatedIndex]
  );

  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, close]);

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
