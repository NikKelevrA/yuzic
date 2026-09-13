import { useRef, type RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

/**
 * A ref for a bottom sheet, typed the way its own API asks for one.
 *
 * The double cast is the point of the file, and it is a library disagreement
 * rather than a shortcut. `useRef<T>(null)` gives `RefObject<T | null>`,
 * because React cannot know the ref will be attached — but `BottomSheetModal`'s
 * props type the ref as `RefObject<BottomSheetModal>`, with no null in it. One
 * of the two has to give, and widening every call site to handle a null that
 * the sheet's own types say cannot occur would spread the disagreement across
 * a dozen screens instead of holding it here.
 *
 * Collected into one function so there is exactly one cast to review rather
 * than one per sheet, which is what there used to be.
 */
export function useSheetRef(): RefObject<BottomSheetModal> {
  return useRef<BottomSheetModal>(null) as unknown as RefObject<BottomSheetModal>;
}
