import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { clampSpeed, type SpeedProfile } from '@/features/playback/speedProfile';

import type { AudioQuality, PreferredCodec } from '@/domain/playback/AudioFormat';

export type { AudioQuality, PreferredCodec };

export interface PlaybackSettingsState {
  wifiStreamQuality: AudioQuality;
  cellularStreamQuality: AudioQuality;
  downloadQuality: AudioQuality;
  preferredCodec: PreferredCodec;
  autoplayEnabled: boolean;
  resumeLongTracksEnabled: boolean;
  queueSyncEnabled: boolean;
  showVolumeSlider: boolean;
  showSleepTimer: boolean;
  showJumpButtons: boolean;
  showPlaybackSpeed: boolean;
  /**
   * Remembered playback rate per kind of listening — see
   * `utils/playback/speedProfile`. Two entries rather than one because a
   * listener wants one speed for talking and another for music; a single
   * global rate followed you out of a podcast into the next song and reset to
   * 1× on every launch.
   */
  playbackSpeeds: Partial<Record<SpeedProfile, number>>;
  /**
   * Seconds of overlap between tracks. `0` is off, which is the default —
   * crossfade is a taste, not an improvement, and a player that fades by
   * default is one that has decided for you.
   */
  crossfadeSeconds: number;
  /** Fade through segues too, rather than hard-cutting where they join. */
  crossfadeAlways: boolean;
  /** Per-band gains in dB, in `EQ_FREQUENCIES` order. All zero is flat. */
  equalizerGains: number[];
}

const initialState: PlaybackSettingsState = {
  wifiStreamQuality: 'original',
  cellularStreamQuality: 'high',
  downloadQuality: 'high',
  preferredCodec: 'mp3',
  autoplayEnabled: true,
  // Default-on: cross-device continuity and resume are what the user asked
  // for by pausing an audiobook or opening the app on a tablet.
  resumeLongTracksEnabled: true,
  queueSyncEnabled: true,
  showVolumeSlider: false,
  showSleepTimer: true,
  showJumpButtons: false,
  showPlaybackSpeed: false,
  playbackSpeeds: {},
  crossfadeSeconds: 0,
  crossfadeAlways: false,
  equalizerGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

const playbackSlice = createSlice({
  name: 'settingsPlayback',
  initialState,
  reducers: {
    setWifiStreamQuality(state, action: PayloadAction<AudioQuality>) {
      state.wifiStreamQuality = action.payload;
    },
    setCellularStreamQuality(state, action: PayloadAction<AudioQuality>) {
      state.cellularStreamQuality = action.payload;
    },
    setDownloadQuality(state, action: PayloadAction<AudioQuality>) {
      state.downloadQuality = action.payload;
    },
    setPreferredCodec(state, action: PayloadAction<PreferredCodec>) {
      state.preferredCodec = action.payload;
    },
    setAutoplayEnabled(state, action: PayloadAction<boolean>) {
      state.autoplayEnabled = action.payload;
    },
    setResumeLongTracksEnabled(state, action: PayloadAction<boolean>) {
      state.resumeLongTracksEnabled = action.payload;
    },
    setQueueSyncEnabled(state, action: PayloadAction<boolean>) {
      state.queueSyncEnabled = action.payload;
    },
    setShowVolumeSlider(state, action: PayloadAction<boolean>) {
      state.showVolumeSlider = action.payload;
    },
    setShowSleepTimer(state, action: PayloadAction<boolean>) {
      state.showSleepTimer = action.payload;
    },
    setShowJumpButtons(state, action: PayloadAction<boolean>) {
      state.showJumpButtons = action.payload;
    },
    setShowPlaybackSpeed(state, action: PayloadAction<boolean>) {
      state.showPlaybackSpeed = action.payload;
    },
    /** Remember a rate for one kind of listening. Clamped here so a bad value
     *  cannot reach the engine even if something writes one. */
    setPlaybackSpeedForProfile(
      state,
      action: PayloadAction<{ profile: SpeedProfile; speed: number }>
    ) {
      if (!state.playbackSpeeds) state.playbackSpeeds = {};
      state.playbackSpeeds[action.payload.profile] = clampSpeed(action.payload.speed);
    },
    setCrossfadeSeconds(state, action: PayloadAction<number>) {
      state.crossfadeSeconds = action.payload;
    },
    setCrossfadeAlways(state, action: PayloadAction<boolean>) {
      state.crossfadeAlways = action.payload;
    },
    setEqualizerGains(state, action: PayloadAction<number[]>) {
      state.equalizerGains = action.payload;
    },
  },
});

export const {
  setWifiStreamQuality,
  setCellularStreamQuality,
  setDownloadQuality,
  setPreferredCodec,
  setAutoplayEnabled,
  setResumeLongTracksEnabled,
  setQueueSyncEnabled,
  setShowVolumeSlider,
  setShowSleepTimer,
  setShowJumpButtons,
  setShowPlaybackSpeed,
  setPlaybackSpeedForProfile,
  setCrossfadeSeconds,
  setCrossfadeAlways,
  setEqualizerGains,
} = playbackSlice.actions;

export default playbackSlice.reducer;

interface PlaybackRootState {
  settingsPlayback: PlaybackSettingsState;
}

export const selectWifiStreamQuality = (state: PlaybackRootState): AudioQuality =>
  state.settingsPlayback.wifiStreamQuality;

export const selectCellularStreamQuality = (state: PlaybackRootState): AudioQuality =>
  state.settingsPlayback.cellularStreamQuality;

export const selectDownloadQuality = (state: PlaybackRootState): AudioQuality =>
  state.settingsPlayback.downloadQuality;

export const selectPreferredCodec = (state: PlaybackRootState): PreferredCodec =>
  state.settingsPlayback.preferredCodec;

export const selectAutoplayEnabled = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.autoplayEnabled;

export const selectResumeLongTracksEnabled = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.resumeLongTracksEnabled;

export const selectQueueSyncEnabled = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.queueSyncEnabled;

export const selectShowVolumeSlider = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.showVolumeSlider;

export const selectShowSleepTimer = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.showSleepTimer;

export const selectShowJumpButtons = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.showJumpButtons;

export const selectShowPlaybackSpeed = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.showPlaybackSpeed;

/**
 * Remembered rates per kind of listening. Read through `speedFor`, never
 * straight off this.
 */
export const selectPlaybackSpeeds = (state: PlaybackRootState): Partial<Record<SpeedProfile, number>> =>
  state.settingsPlayback.playbackSpeeds;

export const selectCrossfadeSeconds = (state: PlaybackRootState): number =>
  state.settingsPlayback.crossfadeSeconds;

export const selectCrossfadeAlways = (state: PlaybackRootState): boolean =>
  state.settingsPlayback.crossfadeAlways;

export const selectEqualizerGains = (state: PlaybackRootState): number[] =>
  state.settingsPlayback.equalizerGains;
