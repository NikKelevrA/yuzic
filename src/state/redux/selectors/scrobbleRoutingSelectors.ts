import { createSelector } from '@reduxjs/toolkit';
import { useSelector } from 'react-redux';
import { RootState } from '@/state/redux/store';
import type { ScrobbleDestinationKind, ScrobbleRoute } from '@/features/settings/scrobbling/state';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { useListenBrainzConfig } from '@/state/redux/selectors/listenbrainzSelectors';
import type { ScrobbleDestination } from '@/utils/offline/offlineMutations';
import type { ListenBrainzConfig } from '@/providers/integration/listenbrainz/config';
import * as listenbrainz from '@/providers/integration/listenbrainz';

/**
 * Per-destination route for the active server, derived with NO migration.
 *
 * A server that stored an explicit route (via `setScrobbleRoute`) always
 * reads that back. A server that never has — every server that existed
 * before this feature, and every new server that hasn't visited the
 * Scrobbling screen yet — gets a route derived on the fly from today's two
 * independent booleans:
 *  - lastfm: `serverScrobbleEnabled` maps to 'through-server' (the server is
 *    what would forward to Last.fm), off maps to 'disabled'. Never 'direct'
 *    — Last.fm-direct isn't built this cut.
 *  - listenbrainz: today's two switches were never meant to combine, but a
 *    route can only hold one value, so 'direct' (yuzic's own LB scrobble)
 *    wins when both happen to be on, since it strictly subsumes what
 *    'through-server' would forward. Only `serverScrobbleEnabled` on and per-
 *    server LB scrobble off means 'through-server'; LB on alone means
 *    'direct'; both off means 'disabled'.
 *
 * Deriving at read time rather than writing a migration means an upgrading
 * user sees the same effective behaviour as before with zero new state, and
 * a fresh install with the defaults (`serverScrobbleEnabled: true`, LB
 * per-server scrobble off) derives to lastfm 'through-server' / listenbrainz
 * 'through-server' — matching the two booleans' own defaults.
 */
export function deriveScrobbleRoute(
  destination: ScrobbleDestinationKind,
  serverScrobbleEnabled: boolean,
  lbScrobbleEnabled: boolean
): ScrobbleRoute {
  if (destination === 'lastfm') {
    return serverScrobbleEnabled ? 'through-server' : 'disabled';
  }
  // listenbrainz
  if (lbScrobbleEnabled) return 'direct';
  if (serverScrobbleEnabled) return 'through-server';
  return 'disabled';
}

const selectScrobbleRoutesForActiveServer = createSelector(
  [(s: RootState) => s.settingsScrobbling.scrobbleRoutes, selectActiveServerId],
  (scrobbleRoutes, activeServerId) =>
    (activeServerId ? scrobbleRoutes?.[activeServerId] : undefined)
);

export const selectScrobbleRoute = (destination: ScrobbleDestinationKind) =>
  createSelector(
    [
      selectScrobbleRoutesForActiveServer,
      (s: RootState) => s.settingsScrobbling.serverScrobbleEnabled,
      (s: RootState) => {
        const activeServerId = s.servers.activeServerId;
        const entry = activeServerId ? s.listenbrainz.byServer[activeServerId] : undefined;
        return entry?.scrobbleEnabled ?? false;
      },
    ],
    (routes, serverScrobbleEnabled, lbScrobbleEnabled): ScrobbleRoute => {
      const stored = routes?.[destination];
      if (stored) return stored;
      return deriveScrobbleRoute(destination, serverScrobbleEnabled, lbScrobbleEnabled);
    }
  );

export const selectLastfmScrobbleRoute = selectScrobbleRoute('lastfm');
export const selectListenBrainzScrobbleRoute = selectScrobbleRoute('listenbrainz');

/**
 * What the playback-side scrobble coordinator (`useScrobbling`) actually
 * needs to act on a listen, with every destination's identity folded away.
 * It sees only two branches:
 *  - `server`: at least one destination is routed 'through-server', so the
 *    active server's own `SongsApi` adapter should be told about the listen
 *    (it owns how that turns into a forward, a session event, or nothing).
 *  - `direct`: the one destination this cut can reach without going through
 *    a server, present only when its route is 'direct' *and* its credential
 *    is actually available — carries everything `submitDirectListen` /
 *    `submitDirectNowPlaying` need, so the coordinator never has to import
 *    or name the destination itself.
 *
 * Collapsing both into a single hook here, in the module that already owns
 * the routing rules, keeps `useScrobbling` a policy layer with zero
 * knowledge of which service 'direct' resolves to today.
 */
type ScrobbleDestinationPlan = {
  server: boolean;
  direct: { kind: ScrobbleDestination; config: ListenBrainzConfig } | null;
};

export function useScrobbleDestinationPlan(): ScrobbleDestinationPlan {
  const lastfmRoute = useSelector(selectLastfmScrobbleRoute);
  const listenBrainzRoute = useSelector(selectListenBrainzScrobbleRoute);
  const directConfig = useListenBrainzConfig();

  const server = lastfmRoute === 'through-server' || listenBrainzRoute === 'through-server';
  const direct = listenBrainzRoute === 'direct' && directConfig
    ? { kind: 'listenbrainz' as ScrobbleDestination, config: directConfig }
    : null;

  return { server, direct };
}

type DirectScrobbleDetails = {
  artist: string;
  track: string;
  album?: string;
  durationSeconds?: number;
  /** Unix seconds when playback started. */
  listenedAt: number;
  durationPlayedSeconds?: number;
};

type DirectNowPlayingDetails = {
  artist: string;
  track: string;
  album?: string;
  durationSeconds?: number;
};

/** Submits a completed listen straight to the 'direct' destination's own API. */
export async function submitDirectListen(
  config: ListenBrainzConfig,
  details: DirectScrobbleDetails
): Promise<void> {
  await listenbrainz.submitScrobble(config, details);
}

/** Announces "now playing" straight to the 'direct' destination's own API. */
export async function submitDirectNowPlaying(
  config: ListenBrainzConfig,
  details: DirectNowPlayingDetails
): Promise<void> {
  await listenbrainz.submitNowPlaying(config, details);
}
