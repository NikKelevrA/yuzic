import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { RepeatModeState, ShuffleMode } from '@/domain/playback/PlaybackModes';
import type { PlayableResource } from '@/features/playback/playableResource';
import { collectionContextOf, segmentAt, type QueueSegment } from '@/features/playback/playingQueue';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import {
  selectPersistedPlaybackActiveServerId,
} from '@/state/redux/selectors/playbackSelectors';
import {
  resetPlaybackForServer,
  setPlaybackCurrentIndex,
  setPlaybackPosition,
  setPlaybackQueue,
  setPlaybackRepeatMode,
  setPlaybackShuffleMode,
} from '@/state/redux/slices/playbackSlice';
import { flushPersistedState } from '@/state/redux/flush';

/**
 * The bridge between the in-memory PlayingContext and the persisted
 * playbackSlice. Callers dispatch small updates through this hook rather
 * than talking to the slice directly, so the write-throttling for the
 * position tick lives in one place and the server-switch invalidation
 * happens automatically.
 *
 * The read side stays in PlayingContext (on mount, it reads the slice and
 * loads the queue). This module owns the write side.
 */

/** Position ticks in every second; persist every N ticks + on track change +
 * on pause. 5s balances "resume feels precise" against "MMKV writes". */
const POSITION_PERSIST_INTERVAL_MS = 5_000;

export function usePlaybackPersistence() {
  const dispatch = useDispatch();
  const activeServerId = useSelector(selectActiveServerId);
  const persistedServerId = useSelector(selectPersistedPlaybackActiveServerId);

  // If the active server changed under the persisted state, wipe. Song ids
  // in the slice belong to whichever server was active when they were saved.
  // Do this before any other write reaches the slice so the reset can't
  // race with an in-flight setPlaybackQueue for the new server.
  useEffect(() => {
    if (activeServerId && persistedServerId && persistedServerId !== activeServerId) {
      dispatch(resetPlaybackForServer({ activeServerId }));
    }
  }, [activeServerId, persistedServerId, dispatch]);

  const lastPositionWriteAtRef = useRef(0);

  const persistQueue = useCallback((args: {
    queue: PlayableResource[];
    segments: QueueSegment[];
    currentIndex: number;
    repeatMode: RepeatModeState;
    shuffleMode: ShuffleMode;
  }) => {
    // Skip non-server-addressable items (radio, podcast) — they synthesize
    // ids no other client (or this client on the next run) could resolve.
    // Their playback is transient by nature; nobody expects to "resume the
    // radio station I was on" through queue persistence.
    //
    // Persisted as `localId`, not `nativeId`: this is a reference read back
    // after the app restarts, once the library may have moved on, and only
    // `localId` is guaranteed to still mean the same track (see the identity
    // note on `PlayableResource`).
    const kept = args.queue
      .map((resource, position) => ({ resource, position }))
      .filter(({ resource }) => resource.song.contentKind === 'song');
    const ids = kept.map(({ resource }) => resource.song.localId);
    // Which album or playlist each kept song was queued from, so its plays
    // still count for that playlist after a relaunch. Looked up by the song's
    // position in the live queue, which is what segments index.
    const queueContexts = kept.map(({ position }) =>
      collectionContextOf(segmentAt(args.segments, position)?.source)
    );
    // Dropping those items shifts everything after them, so the index has to
    // be re-found rather than clamped: the current song's own id is what says
    // where it ended up. It has no place in the saved list only when it is
    // itself one of the dropped kinds, and then the clamp is all there is.
    const currentId = args.queue[args.currentIndex]?.song.localId;
    const mappedIndex = currentId ? ids.indexOf(currentId) : -1;
    dispatch(setPlaybackQueue({
      activeServerId,
      queueSongIds: ids,
      queueContexts,
      currentIndex: mappedIndex >= 0
        ? mappedIndex
        : Math.min(args.currentIndex, Math.max(0, ids.length - 1)),
      repeatMode: args.repeatMode,
      shuffleMode: args.shuffleMode,
    }));
  }, [activeServerId, dispatch]);

  const persistCurrentIndex = useCallback((currentIndex: number) => {
    dispatch(setPlaybackCurrentIndex({ currentIndex }));
  }, [dispatch]);

  /** Throttled — called every second by PlayingProgress; only writes to the
   * slice every 5s. Force=true bypasses the throttle for track-change and
   * pause events, where the latest position is the whole point — and flushes
   * it to disk, because the slice's own persist throttle would otherwise hold
   * it back for three more seconds. A pause from the notification followed by
   * a kill restored the position from the last 10 s tick, about 5 s early. */
  const persistPosition = useCallback((positionSeconds: number, opts: { force?: boolean } = {}) => {
    const now = Date.now();
    if (!opts.force && now - lastPositionWriteAtRef.current < POSITION_PERSIST_INTERVAL_MS) return;
    lastPositionWriteAtRef.current = now;
    dispatch(setPlaybackPosition({ positionMs: Math.floor(positionSeconds * 1000) }));
    if (opts.force) void flushPersistedState().catch(() => {});
  }, [dispatch]);

  const persistRepeatMode = useCallback((mode: RepeatModeState) => {
    dispatch(setPlaybackRepeatMode(mode));
  }, [dispatch]);

  const persistShuffleMode = useCallback((mode: ShuffleMode) => {
    dispatch(setPlaybackShuffleMode(mode));
  }, [dispatch]);

  return {
    persistQueue,
    persistCurrentIndex,
    persistPosition,
    persistRepeatMode,
    persistShuffleMode,
  };
}
