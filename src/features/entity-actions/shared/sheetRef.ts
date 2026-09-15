import type { ForwardedRef } from 'react';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

/**
 * Dismisses the modal behind a `forwardRef<BottomSheetModal>`'s ref, without
 * the `(ref as any)?.current?.dismiss()` every sheet used to repeat. Every
 * sheet in this app is always handed an object ref (from `useRef`/
 * `useSheetRef`, or the caller's own `useRef`), never a callback ref, but the
 * type is `React.Ref<T>` either way — this narrows it properly instead of
 * casting past the union.
 */
export function dismissSheetRef(ref: ForwardedRef<BottomSheetModal>): void {
  if (!ref || typeof ref === 'function') return;
  ref.current?.dismiss();
}
