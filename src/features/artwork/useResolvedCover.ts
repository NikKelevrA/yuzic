import { useEffect, useMemo, useSyncExternalStore } from 'react';

import type { CoverSource } from '@/domain/entities/Cover';
import {
  coverResolutionContextKey,
  requestCoverBackup,
  resolveCoverNow,
  subscribeCoverResolution,
  type ResolvedCover,
} from './coverResolution';

const tokenOf = (resolved: ResolvedCover): string => `${resolved.from}:${JSON.stringify(resolved.cover)}`;

/**
 * The picture to draw for a cover, through `coverResolution`'s one rule, and
 * the request that fills a gap from a backup. Re-renders only when this
 * cover's own answer changes.
 */
export function useResolvedCover(cover: CoverSource): ResolvedCover {
  const token = useSyncExternalStore(subscribeCoverResolution, () => tokenOf(resolveCoverNow(cover)));
  const contextKey = useSyncExternalStore(subscribeCoverResolution, coverResolutionContextKey);

  useEffect(() => {
    requestCoverBackup(cover);
  }, [cover, contextKey]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `token` is what says the answer changed
  return useMemo(() => resolveCoverNow(cover), [cover, token]);
}
