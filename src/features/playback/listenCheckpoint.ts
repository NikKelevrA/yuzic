import { mmkv } from '@/state/mmkvStorage';
import type { Song } from '@/domain/entities/Song';

/**
 * The listen that was in progress, written down in case there is no chance to
 * report it.
 *
 * Everything the app reports about a listen — the history entry, the scrobble,
 * the session `Stopped` — is raised on *departure* from a track. A track that
 * is still playing when the process ends never departs, so it reported
 * nothing: no scrobble however long it had played, and no `Stopped`, which
 * leaves the server showing a `NowPlayingItem` that will sit there until the
 * session is reaped. It is the same hole as the withheld `Stopped`, reached
 * through a door nobody had thought to close.
 *
 * Catching the kill itself is not on offer. Neither platform gives a reliable
 * callback for one, and the background transition is the last moment anything
 * runs for certain. So this does not try to report at the end; it writes down
 * enough for the *next* launch to finish the report, and the next launch
 * replays it through exactly the same path a normal departure takes — the
 * threshold, the history, the offline queue if the network is gone.
 *
 * Deliberately not in Redux. This has to survive a process that did not get to
 * flush anything, and it has to be readable before the store has rehydrated,
 * which is precisely the pair of properties redux-persist cannot promise. One
 * key, one small record, written straight through.
 */

const KEY = 'playback.listenInFlight';

type ListenCheckpoint = {
  /** Which server's listen this is; a checkpoint never crosses servers. */
  serverId: string;
  /** Unix ms the listen started — its identity, matching `startTime`. */
  startedAt: number;
  /** Where the playhead was when this was written. */
  positionSeconds: number;
  /** How much had actually been heard by then. */
  listenedSeconds: number;
  /**
   * Whether the server had been told this track was playing, and therefore
   * whether there is a session out there waiting to be closed.
   *
   * Carried rather than re-derived on the next launch, because the setting may
   * have changed in between and the question is what was true *then*. A
   * listener who has since turned scrobbling off still gets the session they
   * opened closed; a listener who never had it on is never reached for.
   */
  sessionOpen: boolean;
  /**
   * The track itself, in full.
   *
   * The persisted queue stores ids and resolves them against the library on
   * launch. That is right for a queue and wrong here: this record has to be
   * resolvable before anything has loaded, and a scrobble needs an artist and
   * a title, not a reference that may not resolve until after the moment has
   * passed. It is about a kilobyte, once.
   */
  song: Song;
};

/** Writes the listen in flight, replacing any previous one. Never throws. */
export function saveListenCheckpoint(checkpoint: ListenCheckpoint): void {
  try {
    mmkv.set(KEY, JSON.stringify(checkpoint));
  } catch {
    // A checkpoint is a best-effort safety net. Failing to write one must
    // never be what interrupts playback.
  }
}

/** The listen in flight, or null when there is none or it cannot be read. */
export function readListenCheckpoint(): ListenCheckpoint | null {
  try {
    const raw = mmkv.getString(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListenCheckpoint;
    // A record from an older shape is not worth guessing at. The fields below
    // are the ones every reader dereferences.
    if (!parsed?.song?.nativeId || typeof parsed.startedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearListenCheckpoint(): void {
  try {
    mmkv.remove(KEY);
  } catch {
    // As above.
  }
}

/**
 * Drops the checkpoint if it is the listen named, and leaves it otherwise.
 *
 * Keyed rather than unconditional because a departure is reported a second
 * after it happened (see `OUTGOING_SCROBBLE_DELAY_MS`), by which time the
 * heartbeat may already have written a checkpoint for the track that has
 * started. Clearing blindly would throw that one away and reopen the hole for
 * the new track.
 */
export function clearListenCheckpointFor(songId: string, startedAt: number): void {
  const current = readListenCheckpoint();
  if (!current) return;
  if (current.song.nativeId !== songId || current.startedAt !== startedAt) return;
  clearListenCheckpoint();
}
