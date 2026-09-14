import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import type { MediaItem } from '../player/mediaItem';
import type { RepeatModeState, ShuffleMode } from '@/domain/playback/PlaybackModes';
import { getBackend } from '@/features/player/activeBackend';
import { presetToBands } from '@/features/player/audioSettings';
import {
  usePlayerActiveItem,
  usePlayerIsPlaying,
  usePlayerProgress,
} from '@/features/player/usePlayerState';

// The queue holds `PlayableResource` end to end now — `Song` below is the
// domain entity (metadata only, no `streamUrl`), and every function in this
// directory (autoplayFill, restoreQueue, playingQueue, playableMedia) speaks
// it too. The compatibility bridges that used to translate a domain `Song`
// into this file's own pre-rewrite queue shape (one here, two more in
// usePlayableSongResolver) are gone — there is no second shape left to
// convert into.
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import {
  assertPlayable,
  playableOnly,
  sameQueue,
  type PlayableResource,
} from '@/features/playback/playableResource';
import shuffleArray from '@/utils/shuffleArray';
import { useApi } from '@/providers/registry/useApi';
import { buildTrackItem } from '@/utils/builders/buildTrackItem';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import { notify } from '@/components/toast';
import { useTranslation } from 'react-i18next';
import { resourcesFromPlayerQueue, QueueSegment, segmentAt } from '@/features/playback/playingQueue';
import { isRepeatLoop } from '@/features/playback/repeatPlay';
import { createTransportController } from '@/features/playback/transportController';
import { createQueueController } from '@/features/playback/queueController';
import { createAutoplayCoordinator, type AutoplayCoordinator } from '@/features/playback/autoplayCoordinator';
import { createPlaybackCoordinator } from '@/features/playback/playbackCoordinator';
import { createPlaybackStarters, type StartableCollection } from '@/features/playback/playbackStarters';
import { createShuffleController } from '@/features/playback/shuffleController';
import { createPlaybackEventHandlers } from '@/features/playback/playbackEvents';
import { useDownloadActions } from '../offline/DownloadContext';
import { usePlaybackSink } from '../player/PlaybackSinkContext';
import { ownsPlayback } from '@/features/player/playbackSink';
import { useScrobbling } from '@/features/playback/useScrobbling';
import { useCarPlayBrowseTree } from '@/features/player/useCarPlayBrowseTree';
import { useDispatch, useSelector } from 'react-redux';
import { selectPreferredCodec, selectAutoplayEnabled, selectCrossfadeSeconds, selectCrossfadeAlways, selectEqualizerGains, selectPlaybackSpeeds, setPlaybackSpeedForProfile } from '@/features/settings/playback/state';
import { useIsAudiomuseConfigured, useAudiomuseConfig } from '@/state/redux/selectors/audiomuseSelectors';
import { useStreamQuality } from '@/features/playback/useStreamQuality';
import { playableQuality } from '@/utils/audio/playableFormat';
import {
  QueueFillProvider,
  createNativeSimilarityQueueFillProvider,
  createAudiomuseQueueFillProvider,
} from '@/features/playback/queueProviders';
import { buildRestoredQueue } from '@/features/playback/restoreQueue';
import { hasReissuableUrl } from '@/domain/playback/ContentKind';
import { clampSpeed, speedFor, speedProfileFor } from '@/utils/playback/speedProfile';
import { useBookmarkManager } from '@/features/playback/useBookmarkManager';
import { useQueueSync } from '@/features/playback/useQueueSync';
import { usePlaybackPersistence } from '@/features/playback/usePlaybackPersistence';
import {
  selectPersistedPlaybackActiveServerId,
  selectPersistedPlaybackCurrentIndex,
  selectPersistedPlaybackPositionMs,
  selectPersistedPlaybackQueue,
  selectPersistedPlaybackRepeatMode,
  selectPersistedPlaybackShuffleMode,
} from '@/state/redux/selectors/playbackSelectors';
import { selectActiveServerId as selectActiveServerIdSel, selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { useTracks } from '@/features/song/useTracks';
import {
  backendRepeatMode,
  clampVolume,
  nextRepeatMode,
} from '@/features/playback/playingPolicies';

export interface PlaybackProgress {
  position: number;
  duration: number;
  buffered: number;
}

// `RepeatModeState`/`ShuffleMode` now live in `@/domain/playback/PlaybackModes` (see
// the import above) so `playbackSlice.ts` can import just the types without
// pulling in this whole context module — see that file's own comment for
// the cycle this avoids. Only used locally in this file now; nothing else
// imports them from here.
//
// off -> shuffle -> smart -> off, matching the shuffle button's tap cycle.
// 'smart' reorders and blends in tracks from outside the original selection
// (via the tiered AudioMuse/native provider); Autoplay is the separate,
// shuffle-mode-independent feature that extends the queue once it runs out.

/** An album or playlist together with the tracks to queue from it. */
export type PlayableCollection = AlbumDetail | PlaylistDetail;

/**
 * An album or playlist detail, as the starters want it: the tracks plus what
 * context they came from. The starters take this rather than `AlbumDetail |
 * PlaylistDetail` so they need not know the app's two detail shapes.
 */
function startable(collection: PlayableCollection): StartableCollection {
  return 'album' in collection
    ? { songs: collection.songs, contextId: collection.album.localId, contextType: 'album' }
    : { songs: collection.songs, contextId: collection.playlist.localId, contextType: 'playlist' };
}

export interface PlayingStateType {
  currentSong: Song | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentIndex: number;
  /** @deprecated use repeatMode instead */
  repeatOn: boolean;
  repeatMode: RepeatModeState;
  shuffleMode: ShuffleMode;
  playbackSpeed: number;
  /** Player volume 0..1 (independent of the device's system volume). */
  volume: number;
  setCurrentSong(song: Song | null): void;
}

export interface PlayingActionsType {
  pauseSong(): Promise<void>;
  resumeSong(): Promise<void>;
  seekSong(positionSeconds: number): void;
  /**
   * Seeks by `deltaSeconds` from the current position, clamped into the track.
   * Positive jumps forward, negative jumps back. Runs against the live
   * TrackPlayer position rather than any subscribed state, so callers stay
   * unsubscribed from the per-second progress ticks.
   */
  jumpBy(deltaSeconds: number): void;
  playSong(song: Song): Promise<void>;
  playSongInCollection(
    selectedSong: Song,
    collection: PlayableCollection,
    shuffle?: boolean
  ): Promise<void>;
  /** Plays an arbitrary list of songs — a library screen, a genre, a filter —
   * rather than an album or playlist. */
  playSongs(
    songs: Song[],
    options?: { startIndex?: number; shuffle?: boolean; contextId?: string }
  ): Promise<void>;
  addCollectionToQueue(collection: PlayableCollection): void;
  shuffleCollectionToQueue(collection: PlayableCollection): void;
  skipTo(index: number): Promise<void>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  getQueue(): Song[];
  resetQueue(): Promise<void>;
  moveTrack(fromIndex: number, toIndex: number): void;
  addToQueue(song: Song): void;
  playNext(song: Song): void;
  playSimilar(song: Song): Promise<void>;
  cycleShuffleMode(): Promise<void>;
  toggleRepeat(): void;
  setPlaybackSpeed(speed: number): void;
  /** Sets the in-app player volume 0..1. Clamped; doesn't touch device volume. */
  setVolume(volume: number): void;
}

// Combined type kept for backward compat
export type PlayingContextType = PlayingStateType & PlayingActionsType;

const PlayingStateContext = createContext<PlayingStateType | undefined>(undefined);
const PlayingActionsContext = createContext<PlayingActionsType | undefined>(undefined);
const PlayingProgressContext = createContext<PlaybackProgress>({ position: 0, duration: 0, buffered: 0 });
// Split out of PlayingStateType: queueVersion bumps on every queue mutation
// (add/remove/reorder/autoplay-fill), which is far more often than most
// usePlayingState() consumers (the full-screen player, the mini bar, Controls)
// need to re-render for. Only the queue list itself reads this.
const PlayingQueueVersionContext = createContext<number>(0);

/**
 * Whether the player has been set up this launch.
 *
 * Module-level rather than a `useRef` so it survives a remount of the
 * provider: `setup()` claims the audio session and subscribes the event
 * listener, and doing that twice would rebuild the audio graph underneath a
 * playing track.
 *
 * This was briefly a `Set` keyed by which backend, back when there were two
 * and switching between them left the incoming one un-set-up — a plain
 * boolean was already true from the outgoing player, so `setup()` never ran
 * on the new one and the engine sat silent. With one player the key has
 * nothing to distinguish, so it is a boolean again.
 */
const playerSetUp = { current: false };

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

// Backward-compatible hook — consumers that need both state + actions can keep using this.
// For render-sensitive components, prefer usePlayingState() or usePlayingActions() directly.
export const usePlaying = (): PlayingContextType => {
  const state = usePlayingState();
  const actions = usePlayingActions();
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};

export const usePlayingProgress = () => useContext(PlayingProgressContext);
export const usePlayingQueueVersion = () => useContext(PlayingQueueVersionContext);

// Separate component so useProgress ticks don't rerender PlayingProvider.
const PlayingProgressProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { position, duration, buffered } = usePlayerProgress(1);
  // Whoever holds the audio holds the clock. With the jukebox selected the
  // local player is stopped, so `useProgress` sits at zero and the bar would
  // never move — the server's polled position is the real one. Duration still
  // comes from the track: the jukebox reports where it is, not how long the
  // song is, and nothing is buffered on this device at all.
  const { jukeboxState } = usePlaybackSink();
  const { currentSong } = usePlayingState();

  const progress = useMemo<PlaybackProgress>(() => {
    if (jukeboxState) {
      const songDuration = currentSong?.durationSeconds || 0;
      return { position: jukeboxState.positionSeconds, duration: songDuration, buffered: 0 };
    }
    return {
      position: typeof position === 'number' && !Number.isNaN(position) ? position : 0,
      duration: typeof duration === 'number' && !Number.isNaN(duration) ? duration : 0,
      buffered: typeof buffered === 'number' && !Number.isNaN(buffered) ? buffered : 0,
    };
  }, [position, duration, buffered, jukeboxState, currentSong]);

  return (
    <PlayingProgressContext.Provider value={progress}>
      {children}
    </PlayingProgressContext.Provider>
  );
};

export const PlayingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const isPlaying = usePlayerIsPlaying();
  const activeMediaItem = usePlayerActiveItem();
  const api = useApi();
  const { getLocalPath } = useDownloadActions();
  const {
    sink, sinkPause, sinkResume, sinkSeek, sinkLoadQueue, sinkSkipTo, jukeboxState,
  } = usePlaybackSink();
  // The server's own clock, for the handful of places that read a position
  // without going through the progress context.
  const jukeboxPositionRef = useRef(0);
  jukeboxPositionRef.current = jukeboxState?.positionSeconds ?? 0;
  // Read through a ref inside callbacks so switching output doesn't rebuild
  // every transport handler in the tree.
  const sinkRef = useRef(sink);
  sinkRef.current = sink;
  /** The server is holding the audio; the local player must stay out of it. */
  const remoteOwnsPlayback = () => ownsPlayback(sinkRef.current);
  const streamQuality = useStreamQuality();
  const streamQualityRef = useRef(streamQuality);
  streamQualityRef.current = streamQuality;
  const preferredCodec = useSelector(selectPreferredCodec);
  const preferredCodecRef = useRef(preferredCodec);
  preferredCodecRef.current = preferredCodec;
  // The active server, read through a ref so the header-attachment helpers
  // below see the current one without rebuilding every transport handler.
  // Its Basic-auth credentials are the source of the ephemeral request headers
  // a protected Plex needs on both the stream and the artwork fetch.
  const activeServer = useSelector(selectActiveServer);
  const activeServerRef = useRef(activeServer);
  activeServerRef.current = activeServer;

  // Every resource->MediaItem crossing in this file goes through these two, so
  // the header-attachment happens in exactly one place regardless of which
  // consumer (foreground play, queue add, autoplay fill, play-next, restore)
  // built the queue. Unprotected servers get an item identical to before.
  //
  // `sourceServerType` is left for `mediaHeadersForSong` to default to the
  // active server's own type — the domain `Song` inside a resource carries
  // provenance (which server), not that server's type, and every track here
  // is always played against the currently active server.
  const buildItem = useCallback(
    (resource: PlayableResource): MediaItem =>
      buildTrackItem(resource, mediaHeadersForSong(activeServerRef.current, resource)),
    []
  );
  const toMediaItems = useCallback(
    (resources: PlayableResource[]): MediaItem[] => resources.map(buildItem),
    [buildItem]
  );
  const autoplayEnabled = useSelector(selectAutoplayEnabled);

  // Selected as primitives and rebuilt here rather than selected as objects.
  // `useSelector` compares by reference, so a selector that constructs its
  // result hands back a new value every render and re-runs the effects below
  // forever.
  const crossfadeSeconds = useSelector(selectCrossfadeSeconds);
  const crossfadeAlways = useSelector(selectCrossfadeAlways);
  const equalizerGains = useSelector(selectEqualizerGains);
  const crossfade = useMemo(
    () =>
      crossfadeSeconds > 0
        ? {
            durationSec: crossfadeSeconds,
            mode: crossfadeAlways ? ('always' as const) : ('gapless-aware' as const),
            skipIsImmediate: true,
          }
        : null,
    [crossfadeSeconds, crossfadeAlways],
  );
  const equalizerBands = useMemo(() => presetToBands(equalizerGains), [equalizerGains]);
  const isAudiomuseConfigured = useIsAudiomuseConfigured();
  const audiomuseConfig = useAudiomuseConfig();

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatModeState>('off');
  const [shuffleMode, setShuffleMode] = useState<ShuffleMode>('off');
  const [playbackSpeed, setPlaybackSpeedState] = useState(1.0);
  // Read on every track change, which happens off the React render path, so
  // a ref rather than the state value — the same pattern the bookmark map uses.
  const playbackSpeedRef = useRef(1.0);
  const playbackSpeeds = useSelector(selectPlaybackSpeeds);
  const dispatch = useDispatch();
  const playbackSpeedsRef = useRef(playbackSpeeds);
  useEffect(() => { playbackSpeedsRef.current = playbackSpeeds; }, [playbackSpeeds]);
  const [volume, setVolumeState] = useState(1.0);
  const [queueVersion, setQueueVersion] = useState(0);

  const queueRef = useRef<PlayableResource[]>([]);
  const queueSegmentsRef = useRef<QueueSegment[]>([]);
  const originalQueueRef = useRef<PlayableResource[] | null>(null);
  const scrobbleStartTimeRef = useRef<number>(0);
  const currentIndexRef = useRef(0);
  const currentSongRef = useRef<PlayableResource | null>(null);
  const repeatModeRef = useRef<RepeatModeState>('off');
  const shuffleModeRef = useRef<ShuffleMode>('off');
  const autoplayEnabledRef = useRef(false);
  const isPlayingRef = useRef(false);
  const providersRef = useRef<QueueFillProvider[]>([]);
  const fillQueueIfLowRef = useRef<() => Promise<void>>(async () => {});
  // Assigned during render below, like `loadQueueRef` and for the same reason:
  // the effect that reads it is declared above the coordinator that supplies
  // it, and effects run after the whole render rather than in declaration
  // order relative to it.
  const autoplayRef = useRef<AutoplayCoordinator | null>(null);

  // Stable refs to latest callbacks — avoids stale closures in effects without listing
  // volatile deps, while keeping the callbacks themselves stable for context consumers.
  const scrobbleIfNeededRef = useRef<(
    song: Song | null,
    opts: { listenedSeconds: number; startTime: number; playlistId?: string }
  ) => Promise<void>>(async () => {});
  const scrobbleOutgoingRef = useRef<(song: Song | null, listenedSeconds: number) => Promise<void>>(
    async () => {}
  );
  /** Position at the previous heartbeat, so a looping track's restart is visible. */
  const lastTickPositionRef = useRef(0);
  const submitNowPlayingRef = useRef<(song: Song) => void>(() => {});
  const removeFailedCurrentTrackRef = useRef<() => void>(() => {});
  const resolvePlayableSongRef = useRef<(song: Song) => PlayableResource | null>(() => null);

  const { scrobbleIfNeeded, submitNowPlaying, reportPlaybackProgress, resetLastScrobbled } = useScrobbling();
  const bookmarks = useBookmarkManager();
  const bookmarksRef = useRef(bookmarks);
  useEffect(() => { bookmarksRef.current = bookmarks; }, [bookmarks]);

  const queueSync = useQueueSync();
  const queueSyncRef = useRef(queueSync);
  useEffect(() => { queueSyncRef.current = queueSync; }, [queueSync]);

  const persistence = usePlaybackPersistence();
  const persistenceRef = useRef(persistence);
  useEffect(() => { persistenceRef.current = persistence; }, [persistence]);

  // Auto-restore persisted playback on first mount for the active server.
  // This is what makes "the app remembers what I was doing" true on every
  // provider, not just Navidrome — the slice is our source of truth, and
  // the server-side queue mirror in useQueueSync is a secondary path used
  // only when local is empty (see ResumeQueueBanner).
  const persistedQueueIds = useSelector(selectPersistedPlaybackQueue);
  const persistedCurrentIndex = useSelector(selectPersistedPlaybackCurrentIndex);
  const persistedPositionMs = useSelector(selectPersistedPlaybackPositionMs);
  const persistedRepeatMode = useSelector(selectPersistedPlaybackRepeatMode);
  const persistedShuffleMode = useSelector(selectPersistedPlaybackShuffleMode);
  const persistedServerIdForPlayback = useSelector(selectPersistedPlaybackActiveServerId);
  const currentServerId = useSelector(selectActiveServerIdSel);
  // Already the domain `Song[]` the queue itself now speaks — no cast needed
  // to hand it to `buildRestoredQueue`. It used to require `libraryTracks as
  // unknown as Song[]` here, laundering a domain `Song` into the legacy shape
  // the queue held at the time; the type migration removes the need for it
  // rather than fixing it in place. Sourced from the persisted TanStack
  // Query cache via `useTracks` now — see `useAlbums` for why there's no
  // separate Redux mirror to read instead.
  const { tracks: libraryTracks } = useTracks();
  const hasAutoRestoredRef = useRef(false);
  useEffect(() => {
    if (hasAutoRestoredRef.current) return;

    // Why the restore did not happen, said out loud. Every one of these was a
    // bare `return`, so a queue that was displayed but never handed to the
    // player looked identical from the outside to one that had been restored
    // properly — the app showed the track and play did nothing, with nothing
    // anywhere to say which guard had stopped it.
    //
    // Split by whether a restore was *wanted*. "No active server" and "nothing
    // persisted" mean there was nothing to restore, which is most launches and
    // is silent. The other three mean something should have come back and did
    // not, which is what someone reporting "my queue disappeared" is
    // describing — so those say so, once, where a support log will find them.
    const nothingToRestore =
      !currentServerId ? 'no active server'
      : persistedQueueIds.length === 0 ? 'nothing persisted'
      : null;
    if (nothingToRestore) return;

    const blocked =
      persistedServerIdForPlayback !== currentServerId ? `queue belongs to another server (${persistedServerIdForPlayback})`
      : queueRef.current.length > 0 ? 'a queue is already loaded'
      : libraryTracks.length === 0 ? 'library not hydrated yet'
      : null;
    if (blocked) {
      console.warn(`[player] not restoring the persisted queue: ${blocked}`);
      return;
    }

    const { queue: restored, index: idx } = buildRestoredQueue({
      persistedIds: persistedQueueIds,
      persistedIndex: persistedCurrentIndex,
      libraryTracks,
      resolve: resolvePlayableSongRef.current,
    });
    if (restored.length === 0) {
      hasAutoRestoredRef.current = true;
      return;
    }
    hasAutoRestoredRef.current = true;

    // Restore modes before loading the queue — getBackend().setRepeatMode
    // inside loadQueue reads from repeatModeRef, which follows setState.
    setRepeatMode(persistedRepeatMode);
    setShuffleMode(persistedShuffleMode);
    queueRef.current = restored;
    queueSegmentsRef.current = [{
      startIndex: 0,
      length: restored.length,
      source: { kind: 'user', contextId: 'restored', contextType: 'adhoc' },
    }];
    currentIndexRef.current = idx;
    setCurrentIndex(idx);
    currentSongRef.current = restored[idx];
    setCurrentSong(restored[idx].song);
    // Load paused at the persisted position — the user didn't ask us to
    // start playing on cold boot, they asked us to remember where they were.
    // Reported rather than dropped. This was `void`, so the failure that made
    // the restored queue unplayable was invisible from both sides — nothing in
    // a log, and a UI that looked correct.
    loadQueueRef.current(restored, idx, false, Math.floor(persistedPositionMs / 1000))
      .catch((error) => {
        console.warn('[player] restoring the persisted queue failed', error);
      });
  }, [
    currentServerId,
    persistedServerIdForPlayback,
    persistedQueueIds,
    persistedCurrentIndex,
    persistedPositionMs,
    persistedRepeatMode,
    persistedShuffleMode,
    libraryTracks,
  ]);
  const loadQueueRef = useRef<(resources: PlayableResource[], startIndex: number, play?: boolean, seek?: number) => Promise<void>>(async () => {});

  /**
   * Records the listen that is ending, attributed to the collection it came
   * from.
   *
   * Every caller scrobbles the *outgoing* song, and each does so before moving
   * the index, so the current index still points at the queue position that
   * song occupied — which is what carries the playlist tag.
   */
  const scrobbleOutgoing = useCallback((song: Song | null, listenedSeconds: number) => {
    const source = segmentAt(queueSegmentsRef.current, currentIndexRef.current)?.source;
    const playlistId = source?.kind === 'user' && source.contextType === 'playlist'
      ? source.contextId
      : undefined;
    return scrobbleIfNeededRef.current(song, {
      listenedSeconds,
      startTime: scrobbleStartTimeRef.current,
      playlistId,
    });
  }, []);
  // Stable for the life of the provider, so the effects and queue callbacks
  // below can reach it without listing it as a dependency.
  scrobbleOutgoingRef.current = scrobbleOutgoing;

  useEffect(() => { scrobbleIfNeededRef.current = scrobbleIfNeeded; }, [scrobbleIfNeeded]);
  useEffect(() => { submitNowPlayingRef.current = submitNowPlaying; }, [submitNowPlaying]);

  // Session heartbeat for mediaBrowser servers. Jellyfin will drop the session
  // (and never fire the Stopped event the Last.fm plugin scrobbles on) if it
  // stops seeing progress reports. 10s is well inside its ~30s idle window.
  //
  // The same tick also persists the current playback position so a kill or
  // background termination doesn't lose more than ~10s of resume precision.
  // The persistence hook throttles further; this loop is the writer.
  useEffect(() => {
    if (!isPlaying) {
      lastTickPositionRef.current = 0;
      return;
    }
    const interval = setInterval(() => {
      const resource = currentSongRef.current;
      if (!resource) return;
      const song = resource.song;
      const { position: positionSeconds, duration } = getBackend().getProgress();

      // A track on repeat never changes media item, so nothing else in here
      // ever sees it finish. Catching the restart is what makes the second
      // time round count as a second listen instead of being folded into the
      // first — a track left on repeat used to record exactly one play.
      const isLooping = repeatModeRef.current === 'one'
        || (repeatModeRef.current === 'all' && queueRef.current.length === 1);
      if (isRepeatLoop({
        isLooping,
        previousPosition: lastTickPositionRef.current,
        currentPosition: positionSeconds,
        duration,
      })) {
        // The pass that just ended is its own listen, so the guard against
        // scrobbling one track twice has to be released for it.
        resetLastScrobbled();
        void scrobbleOutgoingRef.current(song, Math.floor(lastTickPositionRef.current));
        scrobbleStartTimeRef.current = Date.now();
      }
      lastTickPositionRef.current = positionSeconds;

      reportPlaybackProgress(song, Math.floor(positionSeconds * 1000), false);
      persistenceRef.current.persistPosition(positionSeconds);
    }, 10_000);
    return () => clearInterval(interval);
  }, [isPlaying, reportPlaybackProgress, resetLastScrobbled]);
  useEffect(() => {
    repeatModeRef.current = repeatMode;
    persistenceRef.current.persistRepeatMode(repeatMode);
  }, [repeatMode]);
  useEffect(() => {
    shuffleModeRef.current = shuffleMode;
    persistenceRef.current.persistShuffleMode(shuffleMode);
  }, [shuffleMode]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    // On pause, force-persist so kill-during-pause preserves the paused-at
    // position rather than losing up to the throttle window.
    if (!isPlaying && currentSongRef.current) {
      const positionSeconds = getBackend().getProgress().position;
      persistenceRef.current.persistPosition(positionSeconds, { force: true });
    }
  }, [isPlaying]);
  useEffect(() => { autoplayEnabledRef.current = autoplayEnabled; }, [autoplayEnabled]);

  // AudioMuse-AI first when configured, native similar-songs as fallback —
  // covers both Autoplay's queue-end extension and Smart Shuffle's injection.
  useEffect(() => {
    const providers: QueueFillProvider[] = [];
    if (isAudiomuseConfigured) providers.push(createAudiomuseQueueFillProvider(audiomuseConfig, api));
    providers.push(createNativeSimilarityQueueFillProvider(api));
    providersRef.current = providers;
  }, [isAudiomuseConfigured, audiomuseConfig, api]);

  useCarPlayBrowseTree();

  // Setup rebuilds the audio graph, so it is guarded and runs once per launch.
  //
  // `setCommands` is deliberately *outside* that guard. Re-asserting the
  // remote commands is the only way to reclaim the lock-screen controls from
  // anything else that has called `removeTarget(nil)` on the shared command
  // centre, and a guard around it is what left those controls greyed out while
  // @rntp/player was still in the app destroying them on its way out.
  useEffect(() => {
    if (!playerSetUp.current) {
      try {
        getBackend().setup();
        playerSetUp.current = true;
      } catch (err) {
        console.warn('player setup failed', err);
      }
    }

    getBackend().setCommands();
  }, []);

  /**
   * Push the audio settings down whenever they change.
   *
   * Separate from setup so that changing a slider takes effect immediately
   * rather than at the next launch — an equalizer you have to restart the app
   * to hear is one people conclude is broken.
   *
   * Both are safe to re-send: the engine bypasses a flat EQ and a null
   * crossfade outright, so the steady state costs nothing.
   */
  useEffect(() => {
    getBackend().setCrossfade(crossfade);
  }, [crossfade]);

  useEffect(() => {
    getBackend().setEqualizer(equalizerBands);
  }, [equalizerBands]);

  const bumpQueue = useCallback(() => setQueueVersion(v => v + 1), []);

  // Every queue mutation (playSong, playSongs, playSongInCollection, autoplay
  // fill, smart-shuffle inject, clear) calls bumpQueue immediately after. Rather
  // than sprinkle persistence calls at each site, mirror bumpQueue → persist here.
  useEffect(() => {
    if (queueVersion === 0) return; // Skip the initial state.
    persistenceRef.current.persistQueue({
      queue: queueRef.current,
      currentIndex: currentIndexRef.current,
      repeatMode: repeatModeRef.current,
      shuffleMode: shuffleModeRef.current,
    });
  }, [queueVersion]);

  const clearPlaybackState = useCallback(() => {
    queueRef.current = [];
    queueSegmentsRef.current = [];
    originalQueueRef.current = null;
    currentIndexRef.current = 0;
    currentSongRef.current = null;
    setCurrentIndex(0);
    setCurrentSong(null);
    setShuffleMode('off');
    bumpQueue();
    getBackend().stop();
    getBackend().clear();
  }, [bumpQueue]);

  const removeFailedCurrentTrack = useCallback(() => {
    const failedIndex = currentIndexRef.current;
    const currentQueue = queueRef.current;

    if (currentQueue.length <= 1 || failedIndex < 0 || failedIndex >= currentQueue.length) {
      clearPlaybackState();
      return;
    }

    const failedLocalId = currentQueue[failedIndex]?.song.localId;
    const nextQueue = currentQueue.filter((_, index) => index !== failedIndex);
    const nextIndex = Math.min(failedIndex, nextQueue.length - 1);
    const nextResource = nextQueue[nextIndex] ?? null;

    queueRef.current = nextQueue;
    originalQueueRef.current = originalQueueRef.current
      ? originalQueueRef.current.filter(resource => resource.song.localId !== failedLocalId)
      : null;
    currentIndexRef.current = nextIndex;
    currentSongRef.current = nextResource;
    setCurrentIndex(nextIndex);
    setCurrentSong(nextResource ? nextResource.song : null);
    bumpQueue();

    getBackend().removeMediaItem(failedIndex);
    if (nextResource) {
      getBackend().skipToIndex(nextIndex);
      getBackend().play();
    }
  }, [bumpQueue, clearPlaybackState]);
  removeFailedCurrentTrackRef.current = removeFailedCurrentTrack;

  // Id of the track we've already attempted one URL-refresh retry for. Keyed by
  // `localId` rather than a time window — a wall-clock gate breaks when a
  // failure (e.g. an unreachable server) takes longer than the window to
  // surface, which makes every retry look like a "first" attempt and loops
  // forever. `localId` rather than `nativeId`: a queue can hold tracks from
  // more than one origin, and two origins can both call something the same
  // native id.
  /**
   * Failure handling lives in `playbackEvents`, which owns both the decision's
   * enactment and the three pieces of memory it needs — what has already been
   * retried, how many stalls this song has spent, when the last toast was.
   * Those existed as provider refs among forty others and were reachable by
   * anything; nothing but this uses them.
   */
  const playbackEvents = useMemo(() => createPlaybackEventHandlers({
    backend: getBackend,
    currentResource: () => currentSongRef.current,
    queue: () => queueRef.current,
    currentIndex: () => currentIndexRef.current,
    refreshResource: song => resolvePlayableSongRef.current(song),
    toMediaItems,
    replaceQueue: resources => { queueRef.current = resources; },
    setCurrentResource: resource => {
      currentSongRef.current = resource;
      if (resource) setCurrentSong(resource.song);
    },
    removeFailedCurrentTrack: () => removeFailedCurrentTrackRef.current(),
    notifyError: () => notify.error(t('common.playbackError')),
    logFailure: info => console.warn('Playback failed', info),
    now: Date.now,
  }), [t, toMediaItems]);

  const playbackEventsRef = useRef(playbackEvents);
  useEffect(() => { playbackEventsRef.current = playbackEvents; }, [playbackEvents]);

  useEffect(() => {
    return getBackend().addListener(event => {
      if (event.type !== 'error') return;
      playbackEventsRef.current.onError(event);
    });
  }, []);

  useEffect(() => {
    return getBackend().addListener(event => {
      if (event.type === 'stateChange') setIsBuffering(event.buffering);
    });
  }, []);

  /**
   * The engine's queue moved, so take its answer.
   *
   * Every edit below applies to `queueRef` immediately as well as calling the
   * backend, because the screen has to redraw on the tap rather than an event
   * later. Those edits are *predictions of a call already made*, not the truth:
   * the engine applies the same edit itself, and when the two disagree the
   * engine is right — it is what actually plays.
   *
   * This is where the prediction is replaced by the answer. It also covers the
   * changes the app never made and so could not predict: a skip from the lock
   * screen or the car, a track the engine dropped because it would not open, a
   * queue restored into a fresh JavaScript context. Before this, the only time
   * the two queues were reconciled was on a track change, so a queue edited
   * from outside the app stayed wrong until the song ended.
   *
   * The backend re-reads the engine before emitting, so `getQueue()` here is
   * the engine's queue and not the shadow this is correcting.
   */
  useEffect(() => {
    return getBackend().addListener(event => {
      if (event.type !== 'queueChange') return;
      const next = resourcesFromPlayerQueue(
        getBackend().getQueue(),
        queueRef.current,
        librarySongByIdRef.current
      );
      // An empty queue from the engine is not taken as an instruction to clear:
      // `clearQueue` goes through its own path, and the engine reports empty
      // before a `setQueue` has landed as well as after a genuine clear.
      if (!next.length || sameQueue(queueRef.current, next)) return;
      queueRef.current = next;
      bumpQueue();
    });
  }, [bumpQueue]);

  // Vestigial: a lookup the native-queue reconciliation below falls back to
  // when a track is in neither the in-memory queue nor rebuildable from the
  // player's own item. Nothing currently populates it, so it always misses —
  // left in place as the existing fallback chain rather than removed, since
  // pruning dead reconciliation paths is outside this migration's scope.
  const librarySongByIdRef = useRef<Map<string, PlayableResource>>(new Map());

  /**
   * A track starting is eight separate things, and `playbackCoordinator` owns
   * the order they happen in — which matters: the outgoing scrobble and
   * bookmark are read from the player's position before anything moves the
   * pointer, and autoplay is asked last because it reads the index this has
   * just settled.
   */
  const coordinator = useMemo(() => createPlaybackCoordinator({
    backend: getBackend,
    queue: () => queueRef.current,
    setQueue: resources => { queueRef.current = resources; },
    currentResource: () => currentSongRef.current,
    setActive: (index, resource) => {
      currentIndexRef.current = index;
      setCurrentIndex(index);
      currentSongRef.current = resource;
      setCurrentSong(resource.song);
    },
    library: () => librarySongByIdRef.current,
    bumpQueue,

    onTrackStarted: () => playbackEventsRef.current.onTrackStarted(),
    scrobbleOutgoing: (song, listenedSeconds) => {
      void scrobbleOutgoingRef.current(song, listenedSeconds);
    },
    markNewListen: () => { scrobbleStartTimeRef.current = Date.now(); },
    saveBookmark: (song, positionSeconds) => {
      // Fire and forget: a save failing must not delay the next track.
      void bookmarksRef.current.saveOrClear(song, positionSeconds);
    },
    resumePositionFor: song => bookmarksRef.current.getResumePosition(song.localId),
    persistCurrentIndex: index => persistenceRef.current.persistCurrentIndex(index),

    speedFor: song => speedFor(song, playbackSpeedsRef.current),
    currentSpeed: () => playbackSpeedRef.current,
    setSpeed: speed => {
      playbackSpeedRef.current = speed;
      setPlaybackSpeedState(speed);
      getBackend().setPlaybackSpeed(speed);
    },

    submitNowPlaying: song => submitNowPlayingRef.current(song),
    syncServerQueue: (queue, nativeId, positionMs) => {
      void queueSyncRef.current.save(queue, nativeId, positionMs);
    },

    autoplayEnabled: () => autoplayEnabledRef.current,
    isFilling: () => autoplayRef.current?.isFilling() ?? false,
    fillQueueIfLow: () => { void fillQueueIfLowRef.current(); },
  }), [bumpQueue]);

  const coordinatorRef = useRef(coordinator);
  useEffect(() => { coordinatorRef.current = coordinator; }, [coordinator]);

  useEffect(() => {
    coordinatorRef.current.onActiveTrackChanged(activeMediaItem);
  }, [activeMediaItem]);


  /**
   * Builds the stream URL for a song at the point of playing, never earlier.
   *
   * A local download takes priority and needs no URL at all. Otherwise the
   * real, credentialled URL is built here from `streamId ?? nativeId` — the
   * id to build a stream from, per `Song.streamId`'s own doc — with the
   * user's current quality/codec. `null` means the server could not build one
   * right now; callers drop the track rather than queue something unplayable.
   */
  const resolvePlayableSong = useCallback((song: Song): PlayableResource | null => {
    const localPath = getLocalPath(song.nativeId);
    if (localPath) return { song, streamUrl: localPath, filePath: localPath };
    // A preview clip (Deezer etc.) is issued once and cannot be rebuilt —
    // see `hasReissuableUrl` — so `streamId` carries the literal,
    // already-playable URL rather than an id to build one from. Everything
    // else (song, live stream, podcast episode) is refreshable, and is built
    // fresh here every time rather than trusted from whatever was queued —
    // that staleness is exactly what made a restored queue play nothing.
    if (!hasReissuableUrl(song.contentKind)) {
      return song.streamId ? { song, streamUrl: song.streamId } : null;
    }
    // "Original" serves the untouched file, which is the only way to hear a
    // lossless library losslessly — and the only setting that can hand the
    // device something it cannot decode at all. An Ogg Vorbis album played on
    // every quality except Original, where iOS has no Vorbis decoder and the
    // track failed outright. Transcoding it is a smaller loss than silence.
    const quality = playableQuality({ mimeType: song.audio?.mimeType }, streamQualityRef.current);
    const freshUrl = api.songs.buildStreamUrl(
      song.streamId ?? song.nativeId,
      quality,
      preferredCodecRef.current
    );
    return freshUrl ? { song, streamUrl: freshUrl } : null;
  }, [api, getLocalPath]);
  // Keep ref in sync during render so effects/handlers always have the latest version
  resolvePlayableSongRef.current = resolvePlayableSong;

  const loadQueue = useCallback(async (resources: PlayableResource[], startIndex: number, play = true, seekToPosition?: number) => {
    assertPlayable(resources);
    resetLastScrobbled();
    scrobbleStartTimeRef.current = Date.now();
    if (remoteOwnsPlayback()) {
      // The server plays from its own playlist of ids; nothing is streamed to
      // this device, so the local player is never given the queue at all.
      // Sent to the server, so `nativeId` — the id it understands — not the
      // app's own branded identity.
      await sinkLoadQueue(resources.map(resource => resource.song.nativeId), startIndex, play);
      return;
    }
    getBackend().setMediaItems(toMediaItems(resources), startIndex);
    getBackend().setRepeatMode(backendRepeatMode(repeatModeRef.current));
    if (seekToPosition !== undefined && seekToPosition > 0) getBackend().seekTo(seekToPosition);
    if (play) getBackend().play();
  }, [resetLastScrobbled, sinkLoadQueue, toMediaItems]);
  // Assigned during render, not in an effect. React runs effects in the order
  // they are declared, and the auto-restore effect is declared far above this
  // one — so on first mount it called the placeholder this ref was
  // initialised with, an `async () => {}` that does nothing and resolves
  // successfully. The restore therefore "succeeded" silently: the queue and
  // current song were written to state, the one-shot guard was set, and the
  // player was never given anything. The app showed the remembered queue and
  // play did nothing, with no error anywhere to say why.
  //
  // `resolvePlayableSongRef` above is assigned the same way, for the same
  // reason.
  loadQueueRef.current = loadQueue;

  /**
   * Autoplay and Smart Shuffle live in `autoplayCoordinator`: both extend the
   * queue with tracks nobody chose, and they differ only in where the new
   * tracks go. The re-entry guard that stopped a slow fill being started twice
   * lives there now too, as closure state rather than a provider ref.
   */
  const autoplay = useMemo(() => createAutoplayCoordinator({
    backend: getBackend,
    providers: () => providersRef.current,
    queue: () => queueRef.current,
    setQueue: resources => { queueRef.current = resources; },
    segments: () => queueSegmentsRef.current,
    setSegments: segments => { queueSegmentsRef.current = segments; },
    currentIndex: () => currentIndexRef.current,
    resolvePlayableSong: song => resolvePlayableSongRef.current(song),
    toMediaItems,
    bumpQueue,
    loadQueue: (resources, startIndex, play, seekToPosition) =>
      loadQueueRef.current(resources, startIndex, play, seekToPosition),
    logWarning: (message, error) => console.warn(message, error),
  }), [bumpQueue, toMediaItems]);

  autoplayRef.current = autoplay;
  const { fillQueueIfLow, injectSmartShuffleTracks } = autoplay;
  useEffect(() => { fillQueueIfLowRef.current = fillQueueIfLow; }, [fillQueueIfLow]);


  /**
   * The commands that begin playback live in `playbackStarters`. They agree on
   * far more than they differ — resolve, settle shuffle, replace the queue and
   * its segments, hand it over — and the shuffle snapshot in particular has a
   * rule (taken before the shuffle, before the trim) that was written out
   * three times here.
   */
  const starters = useMemo(() => createPlaybackStarters({
    backend: getBackend,
    queue: () => queueRef.current,
    setQueue: resources => { queueRef.current = resources; },
    segments: () => queueSegmentsRef.current,
    setSegments: segments => { queueSegmentsRef.current = segments; },
    setActive: (index, resource) => {
      currentIndexRef.current = index;
      setCurrentIndex(index);
      currentSongRef.current = resource;
      setCurrentSong(resource.song);
    },
    setShuffleMode,
    setOriginalQueue: resources => { originalQueueRef.current = resources; },
    resolvePlayableSong: song => resolvePlayableSongRef.current(song),
    toMediaItems,
    bumpQueue,
    loadQueue: (resources, startIndex) => loadQueueRef.current(resources, startIndex),
    now: Date.now,
  }), [bumpQueue, toMediaItems]);

  const playSong = starters.playSong;
  const playSongs = starters.playSongs;

  const playSongInCollection = useCallback((
    selectedSong: Song,
    collection: PlayableCollection,
    shuffle = false
  ) => starters.playCollection(selectedSong, startable(collection), shuffle), [starters]);

  const addCollectionToQueue = useCallback((collection: PlayableCollection) => {
    starters.appendCollection(startable(collection), false);
  }, [starters]);

  const shuffleCollectionToQueue = useCallback((collection: PlayableCollection) => {
    starters.appendCollection(startable(collection), true);
  }, [starters]);


  /**
   * Transport lives in `transportController`, which is where the rule about
   * the two players is written down and tested. The provider's job here is to
   * say what "now" means for each fact the controller reads — the refs below
   * are read at command time, not at render time, so a skip issued after the
   * queue moved acts on the queue it moved to.
   */
  const transport = useMemo(() => createTransportController({
    backend: getBackend,
    remoteOwnsPlayback,
    sink: {
      pause: sinkPause,
      resume: sinkResume,
      seek: sinkSeek,
      skipTo: sinkSkipTo,
    },
    jukeboxPosition: () => jukeboxPositionRef.current,
    currentResource: () => currentSongRef.current,
    resourceAt: index => queueRef.current[index],
    queueLength: () => queueRef.current.length,
    currentIndex: () => currentIndexRef.current,
    repeatMode: () => repeatModeRef.current,
    isPlaying: () => isPlayingRef.current,
    scrobbleOutgoing: listenedSeconds =>
      scrobbleOutgoingRef.current(currentSongRef.current?.song ?? null, listenedSeconds),
    setActive: (index, resource) => {
      currentIndexRef.current = index;
      setCurrentIndex(index);
      currentSongRef.current = resource;
      setCurrentSong(resource.song);
    },
    markNewListen: () => { scrobbleStartTimeRef.current = Date.now(); },
  }), [sinkPause, sinkResume, sinkSeek, sinkSkipTo]);

  const { skipToNext, skipToPrevious, skipTo } = transport;
  const pauseSong = transport.pause;
  const resumeSong = transport.resume;
  const seekSong = transport.seek;
  const jumpBy = transport.jumpBy;

  const getQueue = useCallback(() => queueRef.current.map(resource => resource.song), []);

  /**
   * Queue edits live in `queueController`, which is where the requirement to
   * keep the queue, the player, the active index and the segment map in step
   * is written down and tested. The provider supplies what "now" means for
   * each of those.
   */
  const queueController = useMemo(() => createQueueController({
    backend: getBackend,
    queue: () => queueRef.current,
    setQueue: resources => { queueRef.current = resources; },
    segments: () => queueSegmentsRef.current,
    setSegments: segments => { queueSegmentsRef.current = segments; },
    currentIndex: () => currentIndexRef.current,
    setCurrentIndex: index => {
      currentIndexRef.current = index;
      setCurrentIndex(index);
    },
    currentResource: () => currentSongRef.current,
    resolvePlayableSong,
    buildItem,
    bumpQueue,
  }), [bumpQueue, resolvePlayableSong, buildItem]);

  const { moveTrack, addToQueue, playNext } = queueController;

  // AudioMuse-AI first when configured, native similar-songs as fallback —
  // same tiered provider Autoplay and Smart Shuffle use, so "Play Similar"
  // gets acoustic similarity too instead of always hitting the native API.
  //
  // Reuses `playSongs` rather than building a synthetic collection to hand to
  // `playSongInCollection`: the seed is always placed first, which is exactly
  // what `playSongs([song, ...shuffled(others)])` already does, and there is
  // no real album/playlist here to construct a `PlayableCollection` for.
  const playSimilar = useCallback(async (song: Song) => {
    try {
      const similar = await autoplay.relatedTo(song, 20) ?? playableOnly(
        (await api.similar.getSimilarSongs(song.nativeId))
          .map(resolvePlayableSongRef.current)
          .filter((resource): resource is PlayableResource => Boolean(resource))
      );
      const others = similar.filter(resource => resource.song.nativeId !== song.nativeId);
      const songs = [song, ...shuffleArray(others.map(resource => resource.song))];
      await playSongs(songs, { contextId: 'similar' });
      if (others.length > 0) notify.success(t('common.playingSimilar'));
    } catch {
      await playSong(song);
    }
  }, [api, autoplay, playSong, playSongs, t]);

  /**
   * The shuffle cycle lives in `shuffleController`, where the reason restoring
   * is a *reconcile* rather than an assignment is written down: every queue
   * edit made while shuffled touched the live queue and never the snapshot.
   */
  const shuffle = useMemo(() => createShuffleController({
    backend: getBackend,
    queue: () => queueRef.current,
    setQueue: resources => { queueRef.current = resources; },
    setSegments: segments => { queueSegmentsRef.current = segments; },
    currentIndex: () => currentIndexRef.current,
    setCurrentIndex: index => {
      currentIndexRef.current = index;
      setCurrentIndex(index);
    },
    currentResource: () => currentSongRef.current,
    shuffleMode: () => shuffleModeRef.current,
    setShuffleMode,
    originalQueue: () => originalQueueRef.current,
    setOriginalQueue: resources => { originalQueueRef.current = resources; },
    isPlaying: () => isPlayingRef.current,
    bumpQueue,
    loadQueue: (resources, startIndex, play, seekToPosition) =>
      loadQueueRef.current(resources, startIndex, play, seekToPosition),
    injectSmartShuffleTracks,
  }), [bumpQueue, injectSmartShuffleTracks]);

  const cycleShuffleMode = shuffle.cycleShuffleMode;


  const toggleRepeat = useCallback(() => {
    setRepeatMode(prev => {
      const next = nextRepeatMode(prev);
      getBackend().setRepeatMode(backendRepeatMode(next));
      return next;
    });
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = clampVolume(next);
    setVolumeState(clamped);
    getBackend().setVolume(clamped);
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    const clamped = clampSpeed(speed);
    playbackSpeedRef.current = clamped;
    setPlaybackSpeedState(clamped);
    getBackend().setPlaybackSpeed(clamped);
    // Remembered against the kind of thing playing, so choosing 1.5x for a
    // podcast does not follow the user into the next song — and survives a
    // relaunch, which a listener halfway through a series expects.
    dispatch(setPlaybackSpeedForProfile({
      profile: speedProfileFor(currentSongRef.current?.song),
      speed: clamped,
    }));
  }, [dispatch]);

  const resetQueue = useCallback(async () => {
    await scrobbleOutgoingRef.current(
      currentSongRef.current?.song ?? null,
      Math.floor(getBackend().getProgress().position)
    );
    resetLastScrobbled();
    scrobbleStartTimeRef.current = 0;
    getBackend().pause();
    getBackend().clear();
    queueRef.current = [];
    queueSegmentsRef.current = [];
    originalQueueRef.current = null;
    currentIndexRef.current = 0;
    setCurrentIndex(0);
    currentSongRef.current = null;
    setCurrentSong(null);
    setShuffleMode('off');
    setRepeatMode('off');
    getBackend().setRepeatMode('off');
    bumpQueue();
  }, [bumpQueue, resetLastScrobbled]);

  const stateValue = useMemo<PlayingStateType>(() => ({
    currentSong,
    isPlaying,
    isBuffering,
    currentIndex,
    repeatOn: repeatMode !== 'off',
    repeatMode,
    shuffleMode,
    playbackSpeed,
    volume,
    setCurrentSong,
  }), [currentSong, isPlaying, isBuffering, currentIndex, repeatMode, shuffleMode, playbackSpeed, volume]);

  // All callbacks are stable (deps are empty or other stable values via refs),
  // so actionsValue almost never changes after mount — action-only consumers
  // are immune to track/play/index changes.
  const actionsValue = useMemo<PlayingActionsType>(() => ({
    pauseSong,
    resumeSong,
    seekSong,
    jumpBy,
    playSong,
    playSongInCollection,
    playSongs,
    addCollectionToQueue,
    shuffleCollectionToQueue,
    skipTo,
    skipToNext,
    skipToPrevious,
    getQueue,
    resetQueue,
    cycleShuffleMode,
    toggleRepeat,
    setPlaybackSpeed,
    setVolume,
    moveTrack,
    addToQueue,
    playNext,
    playSimilar,
  }), [
    pauseSong,
    resumeSong,
    seekSong,
    jumpBy,
    playSong,
    playSongInCollection,
    playSongs,
    addCollectionToQueue,
    shuffleCollectionToQueue,
    skipTo,
    skipToNext,
    skipToPrevious,
    getQueue,
    resetQueue,
    cycleShuffleMode,
    toggleRepeat,
    setPlaybackSpeed,
    setVolume,
    moveTrack,
    addToQueue,
    playNext,
    playSimilar,
  ]);

  return (
    <PlayingActionsContext.Provider value={actionsValue}>
      <PlayingStateContext.Provider value={stateValue}>
        <PlayingQueueVersionContext.Provider value={queueVersion}>
          <PlayingProgressProvider>
            {children}
          </PlayingProgressProvider>
        </PlayingQueueVersionContext.Provider>
      </PlayingStateContext.Provider>
    </PlayingActionsContext.Provider>
  );
};
