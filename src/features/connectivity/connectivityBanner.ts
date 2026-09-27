/**
 * Which of the two "the server cannot be asked" sentences a screen should
 * show, or none.
 *
 * They are different facts and the app has copy for both, but the banners were
 * written against whichever hook the screen already had. Home asked
 * `useIsOffline`, so it stayed silent in the case worth announcing — the phone
 * online and the server not, where every shelf quietly disappears. Library asks
 * the stronger hook and then says "Offline", which is untrue when the phone has
 * signal.
 *
 * A pure function so the choice can be tested without a network stack, a
 * navigator, or a screen.
 */
type ConnectivityBanner = 'offline' | 'serverUnreachable' | null;

export function connectivityBanner(state: {
  /** The device has no network at all. */
  isOffline: boolean;
  /** The active music server can be asked for something right now. */
  serverReachable: boolean;
}): ConnectivityBanner {
  if (state.serverReachable) return null;
  // Offline wins when both are true: no network is the cause, and "can't reach
  // your server" would send someone to check a server that is fine.
  return state.isOffline ? 'offline' : 'serverUnreachable';
}
