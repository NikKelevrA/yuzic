import type { Track } from 'yuzic-engine';
import type { BackendEvent } from './backend';
import { reconcileQueue, shadowNamesTrack, type Shadow } from './engineBackend';

/**
 * Keeping the backend's shadow of the queue level with the engine's.
 *
 * Split from `createEngineBackend` as one concern: the engine is the
 * authority on the queue, the shadow is the app's synchronous copy of it, and
 * everything here is about the moments the two can disagree — an engine
 * reporting a change the app did not make, a queue a car started before the
 * app was listening, and a track change that names a track the shadow does not
 * hold yet.
 */
export function createEngineQueueSync(deps: {
  load: () => { getQueue(): Promise<Track[]>; getActiveIndex(): Promise<number> };
  getShadow: () => Shadow;
  setShadow: (shadow: Shadow) => void;
  emit: (event: BackendEvent) => void;
}) {
  const { load, getShadow, setShadow, emit } = deps;

  /**
   * Take the queue back from the engine, then tell the app it moved.
   *
   * The shadow's edits are predictions of calls already made, and a
   * prediction is only good until the engine says otherwise. `queueChange` is
   * it saying otherwise — and it is also the only way the app hears about a
   * change it did not make: a remote command from the lock screen or the car,
   * a track the engine dropped because it could not be opened, a queue
   * restored into a fresh JavaScript context.
   *
   * The event is emitted *after* the shadow has been replaced, so a listener
   * that reacts by calling `getQueue()` gets the engine's answer rather than
   * the stale prediction it was sent to correct. Emitting first would make
   * this event actively misleading.
   *
   * Failure is silence rather than an error. The queue the app is showing is
   * the one it last set, which is wrong only if the engine has since changed
   * it — and a reconciliation that could not read the engine has nothing
   * better to offer, while a thrown error here would surface as a playback
   * failure the listener's music never actually had.
   *
   * Resolves true when the engine's queue was taken, false when it was not.
   */
  async function reconcileWithEngine(
    { onlyIntoEmptyShadow = false }: { onlyIntoEmptyShadow?: boolean } = {}
  ): Promise<boolean> {
    try {
      const api = load();
      const [tracks, activeIndex] = await Promise.all([api.getQueue(), api.getActiveIndex()]);
      // See `adoptEngineQueue` below for why a setup-time read may only fill
      // a shadow that is still empty.
      if (onlyIntoEmptyShadow && (getShadow().queue.length > 0 || tracks.length === 0)) return false;
      setShadow(reconcileQueue(getShadow(), tracks, activeIndex));
    } catch {
      return false;
    }
    emit({ type: 'queueChange' });
    return true;
  }

  /**
   * Take a queue the engine already holds when this context starts listening.
   *
   * The car can start playback before the app's JavaScript hears anything —
   * a selection plays natively, and its events reach no listener while the
   * runtime is asleep. Without this the app woke up believing nothing was
   * queued, and the persisted-queue restore then loaded last session's queue
   * over the one the car was playing.
   *
   * Only into an empty shadow, and only a non-empty answer: calls the app
   * made before setup finished are replayed right after this read goes out,
   * so an engine that answers "empty" here may simply not have received them
   * yet, and taking that answer would wipe a queue the app is about to set.
   *
   * A queue taken this way is followed by the track change that started it.
   * That change went to no listener, and it is the only thing that sets what
   * is playing: without it the app showed the queue with nothing playing,
   * over the car's music, until the next track.
   */
  function adoptEngineQueue() {
    void reconcileWithEngine({ onlyIntoEmptyShadow: true }).then(adopted => {
      if (adopted) emit({ type: 'trackChange', index: getShadow().activeIndex });
      markEngineQueueKnown();
    });
  }

  /** See `PlayerBackend.engineQueueKnown`. Also reached when setup fails, so nothing waits forever. */
  let engineQueueChecked = false;
  function markEngineQueueKnown() {
    if (engineQueueChecked) return;
    engineQueueChecked = true;
    emit({ type: 'engineQueueKnown' });
  }

  /** Report a track change once the shadow can say what the track is — see `shadowNamesTrack`. */
  function reportTrackChange(index: number, id: string | null | undefined) {
    if (shadowNamesTrack(getShadow(), index, id)) {
      emit({ type: 'trackChange', index });
      return;
    }
    void reconcileWithEngine().then(() => emit({ type: 'trackChange', index: getShadow().activeIndex }));
  }

  return {
    reconcileWithEngine,
    adoptEngineQueue,
    markEngineQueueKnown,
    reportTrackChange,
    engineQueueKnown: () => engineQueueChecked,
  };
}
