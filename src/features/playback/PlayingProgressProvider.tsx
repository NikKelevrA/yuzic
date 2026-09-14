import React, { createContext, useMemo, type ReactNode } from 'react';

import { usePlaybackSink } from '@/features/player/PlaybackSinkContext';
import { usePlayerProgress } from '@/features/player/usePlayerState';
import type { PlaybackProgress } from './playingTypes';

export const PlayingProgressContext = createContext<PlaybackProgress>({ position: 0, duration: 0, buffered: 0 });

const finiteOrZero = (value: unknown): number =>
  typeof value === 'number' && !Number.isNaN(value) ? value : 0;

/**
 * The per-second position, in its own provider so its ticks re-render only
 * what reads progress — never the playing provider or its consumers.
 *
 * Whoever holds the audio holds the clock. With the jukebox selected the
 * local player is stopped and reports zero, so the server's polled position is
 * the real one; duration still comes from the track, since the jukebox reports
 * where it is, not how long the song is.
 */
export function PlayingProgressProvider({
  durationSeconds,
  children,
}: {
  durationSeconds: number | undefined;
  children: ReactNode;
}) {
  const { position, duration, buffered } = usePlayerProgress(1);
  const { jukeboxState } = usePlaybackSink();

  const progress = useMemo<PlaybackProgress>(() => (
    jukeboxState
      ? { position: jukeboxState.positionSeconds, duration: durationSeconds || 0, buffered: 0 }
      : { position: finiteOrZero(position), duration: finiteOrZero(duration), buffered: finiteOrZero(buffered) }
  ), [buffered, duration, durationSeconds, jukeboxState, position]);

  return (
    <PlayingProgressContext.Provider value={progress}>
      {children}
    </PlayingProgressContext.Provider>
  );
}
