import type { BackendEvent } from './backend';

type Listener = (event: BackendEvent) => void;
type Progress = { position: number; duration: number; buffered: number };

const mockBackend: {
  progress: Progress;
  listeners: Listener[];
  getProgress: jest.Mock<Progress, []>;
  sleepAfterTime: jest.Mock;
  cancelSleepTimer: jest.Mock;
  pause: jest.Mock;
  addListener: jest.Mock<() => void, [Listener]>;
} = {
  progress: { position: 0, duration: 0, buffered: 0 },
  listeners: [],
  getProgress: jest.fn((): Progress => mockBackend.progress),
  sleepAfterTime: jest.fn(),
  cancelSleepTimer: jest.fn(),
  pause: jest.fn(),
  addListener: jest.fn((listener: Listener) => {
    mockBackend.listeners.push(listener);
    return () => { mockBackend.listeners = mockBackend.listeners.filter((l: Listener) => l !== listener); };
  }),
};

jest.mock('./activeBackend', () => ({ getBackend: () => mockBackend }));

import {
  cancelSleepTimer,
  formatSleepCountdown,
  getSleepTimer,
  setSleepTimerPlaybackRate,
  sleepAtEndOfTrack,
  startSleepTimer,
} from './sleepTimer';

const send = (event: BackendEvent) => mockBackend.listeners.forEach((listener: Listener) => listener(event));

describe('sleep timer', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000 });
    cancelSleepTimer();
    setSleepTimerPlaybackRate(1);
    jest.clearAllMocks();
    mockBackend.progress = { position: 0, duration: 0, buffered: 0 };
  });
  afterEach(() => jest.useRealTimers());

  it('hands a duration to the engine and turns itself off when it is up', () => {
    startSleepTimer(15);
    expect(mockBackend.sleepAfterTime).toHaveBeenCalledWith(900);
    expect(getSleepTimer()).toEqual({ mode: 'duration', minutes: 15, endsAt: 1_000_000 + 900_000 });

    jest.advanceTimersByTime(900_000);
    expect(getSleepTimer()).toEqual({ mode: 'off' });
    expect(mockBackend.listeners).toHaveLength(0);
  });

  it('cancels the engine timer when turned off', () => {
    startSleepTimer(5);
    cancelSleepTimer();
    expect(mockBackend.cancelSleepTimer).toHaveBeenCalled();
    expect(getSleepTimer()).toEqual({ mode: 'off' });
  });

  it('points the engine at the end of the playing track', () => {
    mockBackend.progress = { position: 60, duration: 200, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });
    expect(mockBackend.sleepAfterTime).toHaveBeenLastCalledWith(140);
    expect(mockBackend.sleepAfterTime).toHaveBeenCalledTimes(1);

    // Playing on as expected does not re-arm it.
    for (let second = 1; second <= 10; second++) {
      mockBackend.progress = { position: 60 + second, duration: 200, buffered: 0 };
      jest.advanceTimersByTime(1_000);
    }
    expect(mockBackend.sleepAfterTime).toHaveBeenCalledTimes(1);
  });

  it('re-points after a seek or a skip', () => {
    mockBackend.progress = { position: 60, duration: 200, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });

    mockBackend.progress = { position: 0, duration: 300, buffered: 0 };
    send({ type: 'trackChange', index: 1 });
    expect(mockBackend.sleepAfterTime).toHaveBeenLastCalledWith(300);
  });

  it('measures the time left at the playback speed', () => {
    mockBackend.progress = { position: 0, duration: 300, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });
    setSleepTimerPlaybackRate(1.5);
    expect(mockBackend.sleepAfterTime).toHaveBeenLastCalledWith(200);
  });

  it('withdraws the engine timer while paused and re-arms on play', () => {
    mockBackend.progress = { position: 60, duration: 200, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });

    send({ type: 'stateChange', buffering: false, playing: false });
    expect(mockBackend.cancelSleepTimer).toHaveBeenCalled();
    expect(getSleepTimer()).toEqual({ mode: 'endOfTrack' });

    jest.advanceTimersByTime(60_000);
    send({ type: 'stateChange', buffering: false, playing: true });
    expect(mockBackend.sleepAfterTime).toHaveBeenLastCalledWith(140);
  });

  it('turns off once the engine has faded and paused', () => {
    mockBackend.progress = { position: 190, duration: 200, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });

    jest.advanceTimersByTime(9_000);
    send({ type: 'stateChange', buffering: false, playing: false });
    expect(getSleepTimer()).toEqual({ mode: 'off' });
    expect(mockBackend.pause).not.toHaveBeenCalled();
  });

  it('pauses itself if the player runs past the end regardless', () => {
    mockBackend.progress = { position: 190, duration: 200, buffered: 0 };
    sleepAtEndOfTrack();
    send({ type: 'stateChange', buffering: false, playing: true });

    jest.advanceTimersByTime(13_000);
    expect(mockBackend.pause).toHaveBeenCalled();
    expect(getSleepTimer()).toEqual({ mode: 'off' });
  });

  it('formats a countdown', () => {
    expect(formatSleepCountdown(65)).toBe('1:05');
    expect(formatSleepCountdown(3605)).toBe('1:00:05');
  });
});
