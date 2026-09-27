import { isUnavailableOnServer } from '@/features/library/useServerSurface';

/**
 * Which of the five things a list only the server can supply is showing.
 *
 * Radio, Podcasts and Shares each decided this inline, and they had drifted:
 * Radio had no `unavailable` case at all, so a server that simply does not do
 * radio was reported as a failed load with a retry that could never work.
 * "Not supported here" and "that didn't work" are different facts and want
 * different words.
 *
 * Pure, so the ladder can be checked without a server, a query client or a
 * screen — the part that can be wrong is the ordering, not the rendering.
 */
type ServerFeatureStatus =
  | 'offline'
  | 'loading'
  | 'unavailable'
  | 'failed'
  | 'empty'
  | 'ready';

export function serverFeatureStatus(state: {
  rows: readonly unknown[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  serverReachable: boolean;
}): ServerFeatureStatus {
  const rows = state.rows ?? [];
  // Anything already fetched is still worth showing with the server away, so
  // this is "we have nothing and cannot get any", not merely "offline".
  if (!state.serverReachable && rows.length === 0) return 'offline';
  if (state.isLoading) return 'loading';
  // Before the generic failure: asking again cannot give a server a surface it
  // does not have, and offering a retry for it is a promise that cannot land.
  if (state.isError && isUnavailableOnServer(state.error)) return 'unavailable';
  if (state.isError) return 'failed';
  if (rows.length === 0) return 'empty';
  return 'ready';
}
