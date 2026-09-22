import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { useCarPlayBrowseTree } from '@/features/player/useCarPlayBrowseTree';
import { usePlayerIsPlaying } from '@/features/player/usePlayerState';
import { createPlaybackSession } from './playbackSession';
import type { PlayingActionsType, PlayingStateType } from './playingTypes';
import { PlayingProgressContext, PlayingProgressProvider } from './PlayingProgressProvider';
import { usePlaybackEngine } from './usePlaybackEngine';
import { usePlaybackPersistenceSync } from './usePlaybackPersistenceSync';
import { usePlaybackResources } from './usePlaybackResources';
import { usePlaybackServices } from './usePlaybackServices';
import { usePlayerSetup } from './usePlayerSetup';
import { usePlayingCommands } from './usePlayingCommands';
import { useRestorePersistedQueue } from './useRestorePersistedQueue';

const PlayingStateContext = createContext<PlayingStateType | undefined>(undefined);
const PlayingActionsContext = createContext<PlayingActionsType | undefined>(undefined);
// Split from the state: the queue version bumps on every queue edit, far more
// often than the player, the mini bar or the controls need to redraw. Only the
// queue list reads it.
const PlayingQueueVersionContext = createContext<number>(0);

export const usePlayingState = () => {
  const ctx = useContext(PlayingStateContext);
  if (!ctx) throw new Error('usePlayingState must be used within PlayingProvider');
  return ctx;
};

export const usePlayingActions = () => {
  const ctx = useContext(PlayingActionsContext);
  if (!ctx) throw new Error('usePlayingActions must be used within PlayingProvider');
  return ctx;
};

/** State and actions together. Render-sensitive components should take only the half they need. */
export const usePlaying = (): PlayingStateType & PlayingActionsType => {
  const state = usePlayingState();
  const actions = usePlayingActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};

export const usePlayingProgress = () => useContext(PlayingProgressContext);
export const usePlayingQueueVersion = () => useContext(PlayingQueueVersionContext);

/**
 * Playback for the whole app.
 *
 * The facts — queue, pointer, modes — live in one playback session; the
 * engine hook reacts to the player, the commands hook acts on it, and the
 * rest keep persistence and settings in step. This component only wires them
 * together and publishes the result as three contexts, so a consumer
 * re-renders for the half it reads: the command set is stable, state changes
 * with the track, and the queue version with every edit.
 */
export const PlayingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session] = useState(createPlaybackSession);
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const isPlaying = usePlayerIsPlaying();

  usePlayerSetup();
  const resources = usePlaybackResources();
  useCarPlayBrowseTree(resources.resolvePlayableSong);
  const services = usePlaybackServices();
  const engine = usePlaybackEngine(session, resources, services);
  useRestorePersistedQueue(session, resources.resolve, engine.loadQueueRef);
  usePlaybackPersistenceSync({ session, snapshot, isPlaying, services, scrobbleOutgoing: engine.scrobbleOutgoing });
  const actions = usePlayingCommands(session, resources, services, engine);

  const { currentSong, currentIndex, isBuffering, repeatMode, shuffleMode, playbackSpeed, volume, queueVersion } = snapshot;
  const state = useMemo<PlayingStateType>(() => ({
    currentSong,
    isPlaying,
    isBuffering,
    currentIndex,
    repeatOn: repeatMode !== 'off',
    repeatMode,
    shuffleMode,
    playbackSpeed,
    volume,
  }), [currentSong, isPlaying, isBuffering, currentIndex, repeatMode, shuffleMode, playbackSpeed, volume]);

  return (
    <PlayingActionsContext.Provider value={actions}>
      <PlayingStateContext.Provider value={state}>
        <PlayingQueueVersionContext.Provider value={queueVersion}>
          <PlayingProgressProvider durationSeconds={currentSong?.durationSeconds}>
            {children}
          </PlayingProgressProvider>
        </PlayingQueueVersionContext.Provider>
      </PlayingStateContext.Provider>
    </PlayingActionsContext.Provider>
  );
};
