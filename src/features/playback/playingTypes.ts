import type { AlbumDetail, PlaylistDetail } from '@/domain/entities/Detail';
import type { Song } from '@/domain/entities/Song';
import type { RepeatModeState, ShuffleMode } from '@/domain/playback/PlaybackModes';

export interface PlaybackProgress {
  position: number;
  duration: number;
  buffered: number;
}

/** An album or playlist together with the tracks to queue from it. */
export type PlayableCollection = AlbumDetail | PlaylistDetail;

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
}

export interface PlayingActionsType {
  pauseSong(): Promise<void>;
  resumeSong(): Promise<void>;
  seekSong(positionSeconds: number): void;
  /**
   * Seeks by `deltaSeconds` from the current position, clamped into the track.
   * Positive jumps forward, negative jumps back. Runs against the live
   * player position rather than any subscribed state, so callers stay
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
