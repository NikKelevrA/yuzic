import { useSyncExternalStore } from 'react';

/**
 * How far above the bottom edge the tab dock reaches, for toasts to clear.
 *
 * `ToastHost` is mounted at the root so toasts float over every screen, which
 * puts it outside the tab navigator — and `BottomTabBarHeightContext` only
 * exists inside it. Read from the root, that context is always empty, so the
 * host fell back to a fixed guess that landed toasts squarely on the playing
 * bar: for as long as a toast was up, a tap on the mini player hit the toast
 * instead and the player did not open.
 *
 * The dock measures itself and writes its height here; `null` means no dock is
 * mounted (onboarding, modals outside the tabs).
 */
let clearance: number | null = null;
const listeners = new Set<() => void>();

export function setToastClearance(height: number | null): void {
  if (height === clearance) return;
  clearance = height;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToastClearance(): number | null {
  return useSyncExternalStore(subscribe, () => clearance, () => clearance);
}
