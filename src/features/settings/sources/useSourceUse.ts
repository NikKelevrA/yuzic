import { useSelector } from 'react-redux';

import { useIsOffline } from '@/features/connectivity/useIsOffline';
import type { SourceUseId } from '@/providers/registry/sources';
import { selectSourceUse } from './state';

/**
 * Whether a feature may use an outside source for this purpose right now: the
 * user has switched the use on, and the device is online. A switched-on use is
 * not attempted offline, where it could only fail.
 */
export function useSourceUse(use: SourceUseId): boolean {
  const enabled = useSelector(selectSourceUse(use));
  const isOffline = useIsOffline();
  return enabled && !isOffline;
}
