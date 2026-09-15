import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { ServerFeatureUnavailableError } from '@/providers/contracts/ServerAdapter';
import { useApi } from '@/providers/registry/useApi';
import { useServerReachable } from '@/features/connectivity/useServerReachable';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { QueryKeys } from '@/state/query/queryKeys';

type Surface = 'podcasts' | 'shares';

/** Whether a failed request means the server doesn't offer the feature at all. */
export const isUnavailableOnServer = (error: unknown): boolean =>
  error instanceof ServerFeatureUnavailableError;

/**
 * Whether the active server really offers podcasts or shared links.
 *
 * An adapter declaring the surface only says its protocol has the endpoints.
 * Navidrome speaks Subsonic but has never implemented podcasts, and only
 * serves shares when sharing is switched on in its config; both answer 501. The
 * Library showed a row for each regardless, and the screen behind it said
 * "Couldn't load. Check your connection." So the server is asked once — by
 * listing — and the answer is remembered per server. Until it has answered,
 * the row stays out: a row that appears once the server confirms is better
 * than one that goes nowhere.
 */
export function useServerSurface(surface: Surface): boolean {
  const api = useApi();
  const serverId = useSelector(selectActiveServer)?.id;
  const reachable = useServerReachable();
  const declared = Boolean(api[surface]);

  const query = useQuery<boolean>({
    queryKey: [QueryKeys.ServerSurface, serverId, surface],
    queryFn: async () => {
      try {
        if (surface === 'podcasts') await api.podcasts?.list(false);
        else await api.shares?.list();
        return true;
      } catch (error) {
        if (isUnavailableOnServer(error)) return false;
        throw error;
      }
    },
    enabled: declared && Boolean(serverId) && reachable,
    // What a server offers changes with an upgrade or a config edit, not
    // between screens.
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  });

  return declared && query.data === true;
}
