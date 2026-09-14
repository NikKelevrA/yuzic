import { useSyncExternalStore } from 'react';

import type { SourceUseId } from '@/providers/registry/sources';

/**
 * Asking to turn on one source use from where it is needed.
 *
 * Tapping a preview with previews off used to say "turn it on in Settings",
 * which sent people away from the song they had just tapped. A feature calls
 * `promptSourceUse` instead, and the one host at the root asks right there.
 * A plain store, like `notify`, so any component can ask without owning a
 * sheet of its own — a list of songs would otherwise mount a sheet per row.
 */

let pending: SourceUseId | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => pending;

/** Asks whether to turn this use on. A second ask replaces the first. */
export function promptSourceUse(use: SourceUseId): void {
  pending = use;
  emit();
}

export function dismissSourceUsePrompt(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

/** The use being asked about, for the host. */
export const usePendingSourceUse = (): SourceUseId | null =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
