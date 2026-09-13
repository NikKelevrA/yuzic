import type { NetworkType } from '@/hooks/useNetworkType';

/**
 * Whether the download queue may run right now.
 *
 * Downloads are the one thing this app does that can run up a phone bill
 * without anyone asking: auto-download fires off a library sync, not off a
 * tap. So the listener gets a switch, and this is what it means.
 *
 * **An unknown connection is allowed to proceed, and that is a decision.**
 * `useNetworkType` answers `unknown` whenever NetInfo cannot classify the
 * link — which happens on a simulator, on some VPNs, and briefly during any
 * handover. Writing the rule the other way round, as "only run on wifi", reads
 * as more cautious and would stop every download on those devices with no
 * explanation and no way for the listener to tell why. The switch says *not on
 * cellular*, so only a connection known to be cellular holds the queue.
 *
 * Nothing is lost by waiting either way: jobs stay queued and persisted, and
 * the queue drains on its own once the restriction lifts.
 *
 * This was written out twice inside the download provider, once against refs
 * and once against render values, with the `unknown` case implicit in both.
 */
export function mayDownloadNow(policy: {
  /** The listener's "download on WiFi only" setting. */
  wifiOnly: boolean;
  networkType: NetworkType;
}): boolean {
  if (!policy.wifiOnly) return true;
  return policy.networkType !== 'cellular';
}
