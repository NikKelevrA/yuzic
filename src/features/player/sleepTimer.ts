import { useSyncExternalStore } from 'react';
import { getBackend } from './activeBackend';
import type { BackendEvent } from './backend';

/**
 * The sleep timer: what the listener asked for, and keeping the engine to it.
 *
 * The countdown that actually stops the music is the engine's (`SleepTimer` in
 * yuzic-engine), because it has to fire while JavaScript is suspended. The
 * engine only knows durations, so "end of track" is this module keeping that
 * duration pointed at the end of whatever is playing — re-pointed when the
 * listener seeks, skips, changes speed, and withdrawn while paused, since a
 * paused track is not getting any closer to its end.
 *
 * In memory on purpose. The engine's timer does not survive the process, so a
 * timer remembered across a relaunch would count down to nothing.
 */
export type SleepTimer =
  | { mode: 'off' }
  | { mode: 'duration'; minutes: number; endsAt: number }
  | { mode: 'endOfTrack' };

const OFF: SleepTimer = { mode: 'off' };
/** The engine starts its fade this long before the time it was given (8s, and some slack). */
const FADE_WINDOW_MS = 9_000;
/** How far the end of the track may move before the engine is re-pointed at it. */
const DRIFT_MS = 1_500;
const TICK_MS = 1_000;

let timer: SleepTimer = OFF;
const listeners = new Set<() => void>();
let tick: ReturnType<typeof setInterval> | null = null;
let unsubscribeBackend: (() => void) | null = null;

/** End of track: when the engine's timer is set to have finished fading, if it is set. */
let armedEndsAt: number | null = null;
/** From the engine's state events; null until the first one arrives. */
let playing: boolean | null = null;
let playbackRate = 1;

function emit(next: SleepTimer) {
  timer = next;
  listeners.forEach(listener => listener());
}

function stopWatching() {
  if (tick) clearInterval(tick);
  tick = null;
  unsubscribeBackend?.();
  unsubscribeBackend = null;
  armedEndsAt = null;
  playing = null;
}

function startWatching() {
  stopWatching();
  tick = setInterval(update, TICK_MS);
  unsubscribeBackend = getBackend().addListener(onBackendEvent);
}

function onBackendEvent(event: BackendEvent) {
  if (event.type === 'stateChange') playing = event.playing;
  if (event.type === 'stateChange' || event.type === 'trackChange') update();
}

/** The timer has done its job. The engine's own timer is left to finish its fade. */
function finish() {
  stopWatching();
  emit(OFF);
}

function update() {
  const now = Date.now();
  if (timer.mode === 'duration') {
    if (now >= timer.endsAt) finish();
    return;
  }
  if (timer.mode !== 'endOfTrack') return;

  const backend = getBackend();
  const { position, duration } = backend.getProgress();
  // Before the first state event, a track with a length is taken as playing:
  // the sheet that sets this timer is opened from the player.
  const isPlaying = playing ?? duration > 0;

  if (armedEndsAt !== null && now >= armedEndsAt - FADE_WINDOW_MS) {
    // The engine is fading, or has finished. Re-pointing it now would restart
    // a fade already under way, so wait for the pause it ends in. If the
    // player ran past the end anyway, stop it here rather than play on.
    if (!isPlaying) finish();
    else if (now >= armedEndsAt + 2 * TICK_MS) {
      backend.pause();
      finish();
    }
    return;
  }

  if (!isPlaying || !(duration > 0)) {
    if (armedEndsAt !== null) {
      backend.cancelSleepTimer();
      armedEndsAt = null;
    }
    return;
  }

  const endsAt = now + (Math.max(0, duration - position) / playbackRate) * 1000;
  if (armedEndsAt === null || Math.abs(endsAt - armedEndsAt) > DRIFT_MS) {
    backend.sleepAfterTime((endsAt - now) / 1000);
    armedEndsAt = endsAt;
  }
}

/** Stop playback after this many minutes, replacing any timer already set. */
export function startSleepTimer(minutes: number) {
  const seconds = minutes * 60;
  stopWatching();
  getBackend().sleepAfterTime(seconds);
  emit({ mode: 'duration', minutes, endsAt: Date.now() + seconds * 1000 });
  startWatching();
}

/** Stop playback when the track playing now — or whichever replaces it — ends. */
export function sleepAtEndOfTrack() {
  getBackend().cancelSleepTimer();
  emit({ mode: 'endOfTrack' });
  startWatching();
  update();
}

export function cancelSleepTimer() {
  if (timer.mode === 'off') return;
  getBackend().cancelSleepTimer();
  finish();
}

/** The speed the player runs at, so "end of track" is measured in the listener's time. */
export function setSleepTimerPlaybackRate(rate: number) {
  if (!(rate > 0) || rate === playbackRate) return;
  playbackRate = rate;
  update();
}

export function getSleepTimer(): SleepTimer {
  return timer;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useSleepTimer(): SleepTimer {
  return useSyncExternalStore(subscribe, getSleepTimer, getSleepTimer);
}

/** Whole seconds left on a duration timer. */
export function sleepTimerSecondsLeft(endsAt: number, now = Date.now()): number {
  return Math.max(0, Math.round((endsAt - now) / 1000));
}

export function formatSleepCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}
