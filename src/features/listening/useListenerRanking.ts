import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { PlayableResource } from '@/features/playback/playableResource';
import type { RootState } from '@/state/redux/store';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { buildSequenceGraph } from './listeningSequence';
import { rankForListener } from './listeningRanking';

/**
 * The listener's own history, shaped for autoplay.
 *
 * Everything expensive is memoised against the event log, so the sequence
 * graph is rebuilt when a track change appends an event and not once per
 * fill. A fill happens every ten tracks or so; a rebuild is one pass over at
 * most four thousand events, which is cheaper than the network call it
 * accompanies either way.
 *
 * Returns identity when there is no active server. Autoplay then behaves
 * exactly as it did before any of this existed — which is the right answer on
 * a fresh install, where the history is empty and has nothing to say.
 */
export function useListenerRanking(): (
  candidates: PlayableResource[],
  after: PlayableResource | null,
) => PlayableResource[] {
  const events = useSelector((state: RootState) => state.listening.events);
  const totals = useSelector((state: RootState) => state.listening.totals);
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id;

  const graph = useMemo(() => buildSequenceGraph(events), [events]);

  return useCallback(
    (candidates, after) => {
      if (!serverId) return candidates;
      const keyOf = (resource: PlayableResource) => `${serverId}:${resource.song.nativeId}`;
      return rankForListener(candidates, keyOf, {
        after: after ? keyOf(after) : null,
        graph,
        totals,
        now: Date.now(),
      });
    },
    [graph, totals, serverId],
  );
}
