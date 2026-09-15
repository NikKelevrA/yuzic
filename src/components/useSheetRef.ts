import { useRef, type RefObject } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

/**
 * A ref for a bottom sheet.
 *
 * Typed with the `null` React gives it until the sheet mounts, so callers
 * write `ref.current?.present()` and the compiler holds them to it. This used
 * to cast that `null` away with `as unknown as`, on the belief that the sheet
 * library demanded a non-null ref. It did not: the only non-null declaration
 * was one of this app's own props, since widened.
 */
export function useSheetRef(): RefObject<BottomSheetModal | null> {
  return useRef<BottomSheetModal>(null);
}
