import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@/state/redux/store';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  UNINFORMED_MODEL,
  buildListenerModel,
  type ListenerModel,
} from './listenerModel';

/**
 * The listener model, built from the log, for anything that needs it.
 *
 * Memoised against the two arrays it reads, so the sequence graph is rebuilt
 * when a track change appends an event and not once per caller. Every feature
 * that wants to know something about this listener takes it from here, which
 * is the point: one model, one place the policies live, and no second opinion
 * about what a skip is worth.
 *
 * Falls back to `UNINFORMED_MODEL` with no active server. The alternative —
 * returning null and making every call site check — is how half of them end up
 * not checking.
 */
export function useListenerModel(): ListenerModel {
  const events = useSelector((state: RootState) => state.listening.events);
  const track = useSelector((state: RootState) => state.listening.totals);
  const album = useSelector((state: RootState) => state.listening.albums);
  const artist = useSelector((state: RootState) => state.listening.artists);
  const playlist = useSelector((state: RootState) => state.listening.playlists);
  const activeServer = useSelector(selectActiveServer);

  return useMemo(() => {
    if (!activeServer?.id) return UNINFORMED_MODEL;
    return buildListenerModel({
      events,
      rollups: { track, album, artist, playlist },
      now: Date.now(),
    });
  }, [events, track, album, artist, playlist, activeServer?.id]);
}
