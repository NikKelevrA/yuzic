import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';

import { notify } from '@/components/toast';
import type { Song } from '@/domain/entities/Song';
import { getBackend } from '@/features/player/activeBackend';
import { usePlaybackSink } from '@/features/player/PlaybackSinkContext';
import { ownsPlayback } from '@/features/player/playbackSink';
import { setPlaybackSpeedForProfile } from '@/features/settings/playback/state';
import type { PlaybackSession } from './playbackSession';
import { createPlaybackStarters, type StartableCollection } from './playbackStarters';
import { playableOnly, type PlayableResource } from './playableResource';
import { backendRepeatMode, clampVolume, nextRepeatMode } from './playingPolicies';
import type { PlayableCollection, PlayingActionsType } from './playingTypes';
import { createQueueController } from './queueController';
import shuffleArray from './shuffleArray';
import { createShuffleController } from './shuffleController';
import { clampSpeed, speedProfileFor } from './speedProfile';
import { createTransportController } from './transportController';
import { useLatestRef } from './useLatestRef';
import type { PlaybackEngine } from './usePlaybackEngine';
import type { PlaybackResources } from './usePlaybackResources';
import type { PlaybackServices } from './usePlaybackServices';

/** An album or playlist as the starters want it: the tracks and where they came from. */
function startable(collection: PlayableCollection): StartableCollection {
  return 'album' in collection
    ? { songs: collection.songs, contextId: collection.album.localId, contextType: 'album' }
    : { songs: collection.songs, contextId: collection.playlist.localId, contextType: 'playlist' };
}

/**
 * Everything the app can ask playback to do, as one stable command set.
 *
 * Each group of commands lives in its own controller, where its rules are
 * written down and tested; this binds them to the session and the player.
 * Controllers read the session when a command runs, not when it was built, so
 * a skip issued after the queue moved acts on the queue it moved to.
 */
export function usePlayingCommands(
  session: PlaybackSession,
  resources: PlaybackResources,
  services: PlaybackServices,
  engine: PlaybackEngine
): PlayingActionsType {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { sink, sinkPause, sinkResume, sinkSeek, sinkSkipTo, jukeboxState } = usePlaybackSink();
  const sinkRef = useLatestRef(sink);
  const jukeboxPosition = useLatestRef(jukeboxState?.positionSeconds ?? 0);
  const { api, buildItem, toMediaItems, resolve, resolvePlayableSong } = resources;
  const { resetLastScrobbled } = services;
  const { loadQueueRef, scrobbleOutgoing, autoplay } = engine;

  const starters = useMemo(() => createPlaybackStarters({
    backend: getBackend,
    queue: session.queue,
    setQueue: session.setQueue,
    segments: session.segments,
    setSegments: session.setSegments,
    setActive: session.setActive,
    setShuffleMode: session.setShuffleMode,
    setOriginalQueue: session.setOriginalQueue,
    resolvePlayableSong: song => resolve.current(song),
    toMediaItems,
    bumpQueue: session.bumpQueue,
    loadQueue: (queue, startIndex) => loadQueueRef.current(queue, startIndex),
    now: Date.now,
  }), [loadQueueRef, resolve, session, toMediaItems]);

  const transport = useMemo(() => createTransportController({
    backend: getBackend,
    remoteOwnsPlayback: () => ownsPlayback(sinkRef.current),
    sink: { pause: sinkPause, resume: sinkResume, seek: sinkSeek, skipTo: sinkSkipTo },
    jukeboxPosition: () => jukeboxPosition.current,
    currentResource: session.currentResource,
    resourceAt: index => session.queue()[index],
    queueLength: () => session.queue().length,
    currentIndex: session.currentIndex,
    repeatMode: session.repeatMode,
    isPlaying: session.isPlaying,
    scrobbleOutgoing: listenedSeconds =>
      scrobbleOutgoing(session.currentResource()?.song ?? null, listenedSeconds),
    setActive: session.setActive,
    markNewListen: () => session.markNewListen(),
  }), [jukeboxPosition, scrobbleOutgoing, session, sinkPause, sinkRef, sinkResume, sinkSeek, sinkSkipTo]);

  const queue = useMemo(() => createQueueController({
    backend: getBackend,
    queue: session.queue,
    setQueue: session.setQueue,
    segments: session.segments,
    setSegments: session.setSegments,
    currentIndex: session.currentIndex,
    setCurrentIndex: session.setCurrentIndex,
    currentResource: session.currentResource,
    resolvePlayableSong,
    buildItem,
    bumpQueue: session.bumpQueue,
  }), [buildItem, resolvePlayableSong, session]);

  const shuffle = useMemo(() => createShuffleController({
    backend: getBackend,
    queue: session.queue,
    setQueue: session.setQueue,
    setSegments: session.setSegments,
    currentIndex: session.currentIndex,
    setCurrentIndex: session.setCurrentIndex,
    currentResource: session.currentResource,
    shuffleMode: session.shuffleMode,
    setShuffleMode: session.setShuffleMode,
    originalQueue: session.originalQueue,
    setOriginalQueue: session.setOriginalQueue,
    isPlaying: session.isPlaying,
    bumpQueue: session.bumpQueue,
    loadQueue: (resourcesToLoad, startIndex, play, seekToPosition) =>
      loadQueueRef.current(resourcesToLoad, startIndex, play, seekToPosition),
    injectSmartShuffleTracks: autoplay.injectSmartShuffleTracks,
  }), [autoplay, loadQueueRef, session]);

  const { playSong, playSongs } = starters;

  // The same tiered fill sources as Autoplay, so "Play Similar" gets acoustic
  // similarity where it is set up. The seed always plays first.
  const playSimilar = useCallback(async (song: Song) => {
    try {
      const similar = await autoplay.relatedTo(song, 20) ?? playableOnly(
        (await api.similar.getSimilarSongs(song.nativeId))
          .map(candidate => resolve.current(candidate))
          .filter((resource): resource is PlayableResource => Boolean(resource))
      );
      const others = similar.filter(resource => resource.song.nativeId !== song.nativeId);
      await playSongs([song, ...shuffleArray(others.map(resource => resource.song))], { contextId: 'similar' });
      if (others.length > 0) notify.success(t('common.playingSimilar'));
    } catch {
      await playSong(song);
    }
  }, [api, autoplay, playSong, playSongs, resolve, t]);

  const toggleRepeat = useCallback(() => {
    const next = nextRepeatMode(session.repeatMode());
    session.setRepeatMode(next);
    getBackend().setRepeatMode(backendRepeatMode(next));
  }, [session]);

  const setVolume = useCallback((next: number) => {
    const volume = clampVolume(next);
    session.setVolume(volume);
    getBackend().setVolume(volume);
  }, [session]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const clamped = clampSpeed(speed);
    session.setPlaybackSpeed(clamped);
    getBackend().setPlaybackSpeed(clamped);
    // Remembered against the kind of thing playing, so 1.5x for a podcast
    // does not follow the listener into the next song — and survives a relaunch.
    dispatch(setPlaybackSpeedForProfile({ profile: speedProfileFor(session.currentResource()?.song), speed: clamped }));
  }, [dispatch, session]);

  const resetQueue = useCallback(async () => {
    const backend = getBackend();
    await scrobbleOutgoing(session.currentResource()?.song ?? null, Math.floor(backend.getProgress().position));
    resetLastScrobbled();
    session.clearListen();
    backend.pause();
    backend.clear();
    session.clearQueue();
    session.setRepeatMode('off');
    backend.setRepeatMode('off');
    session.bumpQueue();
  }, [resetLastScrobbled, scrobbleOutgoing, session]);

  const getQueue = useCallback(() => session.queue().map(resource => resource.song), [session]);

  return useMemo<PlayingActionsType>(() => ({
    pauseSong: transport.pause,
    resumeSong: transport.resume,
    seekSong: transport.seek,
    jumpBy: transport.jumpBy,
    skipTo: transport.skipTo,
    skipToNext: transport.skipToNext,
    skipToPrevious: transport.skipToPrevious,
    playSong,
    playSongs,
    playSongInCollection: (selectedSong, collection, shuffleOn = false) =>
      starters.playCollection(selectedSong, startable(collection), shuffleOn),
    addCollectionToQueue: collection => starters.appendCollection(startable(collection), false),
    shuffleCollectionToQueue: collection => starters.appendCollection(startable(collection), true),
    moveTrack: queue.moveTrack,
    addToQueue: queue.addToQueue,
    playNext: queue.playNext,
    getQueue,
    resetQueue,
    playSimilar,
    cycleShuffleMode: shuffle.cycleShuffleMode,
    toggleRepeat,
    setPlaybackSpeed,
    setVolume,
  }), [getQueue, playSimilar, playSong, playSongs, queue, resetQueue, setPlaybackSpeed, setVolume, shuffle, starters, toggleRepeat, transport]);
}
