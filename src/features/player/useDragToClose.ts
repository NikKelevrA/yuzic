import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';

import { PLAYER_SPRING } from '@/features/player/PlayerExpansion';
import { settleFromPlayer } from '@/features/player/settle';

/**
 * Dragging the player down puts it back in the dock, but the same finger
 * on the same surface also scrolls the cards below the fold. The list wins
 * whenever it has somewhere to go: only a downward drag from the very top
 * moves the player, which is the rule every music app's player follows and
 * the one thumbs already expect.
 */
export function useDragToClose(
  expansion: SharedValue<number>,
  scrollY: SharedValue<number>,
  height: number,
) {
  // Whether the pan has actually moved the player, as opposed to being a
  // scroll that its sibling gesture handled. A gesture that decided nothing
  // must not settle as though it decided something — see `settle.ts`.
  const dragMoved = useSharedValue(false);

  return useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .onBegin(() => {
            dragMoved.value = false;
          })
          .onUpdate(event => {
            if (scrollY.value > 0 || event.translationY <= 0) return;
            dragMoved.value = true;
            expansion.value = Math.max(0, Math.min(1, 1 - event.translationY / height));
          })
          // `onFinalize`, not `onEnd`: a gesture that is cancelled or
          // interrupted — by the scroll view winning, by another
          // animation, by the touch being stolen — never reaches
          // `onEnd` at all, and that is the exit that used to leave
          // `expansion` parked at an intermediate value with the
          // playing bar faded to invisible (#211). `onFinalize` runs
          // for every ending, so there is exactly one way out and it
          // always names 0 or 1.
          .onFinalize(event => {
            const target = settleFromPlayer(expansion.value, event.velocityY, dragMoved.value);
            // A tap: the pressable already started the spring it meant.
            if (target === null) return;
            expansion.value = withSpring(target, PLAYER_SPRING);
          }),
        // Hands the scroll view's own gesture to RNGH so the two are
        // siblings that may both run, rather than the pan swallowing
        // every touch before the list ever sees it.
        Gesture.Native(),
      ),
    [dragMoved, expansion, height, scrollY],
  );
}
