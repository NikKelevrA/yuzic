import { Alert } from 'react-native';
import haptics from '@/utils/haptics';
import { notify } from '@/components/toast';

/**
 * The one star/unstar implementation. Songs and albums each keep their own
 * `useStar*`/`useUnstar*` React Query hooks (different domain types, different
 * cache keys) but the orchestration around them — haptics, the mutate call,
 * the success/failure toast, closing the sheet — is identical and lives here
 * once.
 *
 * `offlineAware` preserves a real difference between the two callers: the
 * song sheet swaps in "…offline" toast copy while offline (queued sync),
 * the album sheet does not — see the entity-actions report for why that is
 * kept rather than unified.
 */
export async function toggleFavorite(opts: {
  isStarred: boolean;
  star: () => Promise<unknown>;
  unstar: () => Promise<unknown>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  title: string;
  addedKey: string;
  removedKey: string;
  failedKey: string;
  offlineAware?: boolean;
  isOffline?: boolean;
  addedOfflineKey?: string;
  removedOfflineKey?: string;
  close: () => void;
}): Promise<void> {
  haptics.selection();
  try {
    if (opts.isStarred) {
      await opts.unstar();
      const key = opts.offlineAware && opts.isOffline && opts.removedOfflineKey
        ? opts.removedOfflineKey
        : opts.removedKey;
      notify.success(opts.t(key, { title: opts.title }));
    } else {
      await opts.star();
      const key = opts.offlineAware && opts.isOffline && opts.addedOfflineKey
        ? opts.addedOfflineKey
        : opts.addedKey;
      notify.success(opts.t(key, { title: opts.title }));
    }
  } catch {
    notify.error(opts.t(opts.failedKey));
  } finally {
    opts.close();
  }
}

/** Shared destructive-confirm + run, used by playlist delete and track-download removal. */
export function confirmDestructive(opts: {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}): void {
  Alert.alert(opts.title, opts.body, [
    { text: opts.cancelLabel, style: 'cancel' },
    { text: opts.confirmLabel, style: 'destructive', onPress: () => void opts.onConfirm() },
  ]);
}
