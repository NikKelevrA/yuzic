import { renderHook, act } from '@testing-library/react-native';

import { useAcquireAndPlaySong, hasReachedAcquireDeadline } from './useAcquireAndPlaySong';
import { __resetToasts, __getToasts } from '@/components/toast/notify';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key;

/* eslint-disable no-var -- hoisted for the jest.mock factories below */
var mockServerUrls: { musicbrainz?: string } = {};
var mockResolverConnected = false;
var mockLocalSongImpl: (song: unknown) => unknown = () => null;
var mockResolvePlayableSong = jest.fn();
var mockPlaySong = jest.fn();
var mockResolve = jest.fn();
/* eslint-enable no-var */

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
jest.mock('@/features/settings/sources/useSelfHostedMusicbrainzConfigured', () => ({
  useSelfHostedMusicbrainzConfigured: () => !!mockServerUrls.musicbrainz?.trim(),
}));
jest.mock('@/features/library/useLocalFirst', () => ({
  useLocalFirst: () => ({ localSong: (song: unknown) => mockLocalSongImpl(song) }),
}));
jest.mock('@/features/song/usePlayableSongResolver', () => ({
  usePlayableSongResolver: () => ({ resolvePlayableSong: mockResolvePlayableSong }),
}));
jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingActions: () => ({ playSong: mockPlaySong }),
}));
jest.mock('./registry', () => ({
  useDownloaderStates: () => [
    {
      def: { id: 'ytfallback' },
      config: { serverUrl: 'http://nas:5020', apiKey: 'key' },
      isConnected: mockResolverConnected,
    },
  ],
}));
jest.mock('@/providers/integration/ytfallback', () => ({
  resolve: (...args: unknown[]) => mockResolve(...args),
}));

const song = {
  localId: 'local:song:1',
  nativeId: 'n1',
  title: 'Numb',
  artist: { name: 'Linkin Park' },
  externalIds: {},
} as never;

const albumStub = { localId: 'local:album:1', nativeId: 'a1', title: 'Meteora', artist: { name: 'Linkin Park' } } as never;

beforeEach(() => {
  jest.useRealTimers();
  __resetToasts();
  mockServerUrls = {};
  mockResolverConnected = false;
  mockLocalSongImpl = () => null;
  mockResolvePlayableSong.mockReset().mockResolvedValue({ song });
  mockPlaySong.mockReset().mockResolvedValue(undefined);
  mockResolve.mockReset().mockResolvedValue({ status: 'pending', jobId: 'job-1', progress: 0 });
});

describe('useAcquireAndPlaySong — the gate', () => {
  it('is closed with no self-hosted MusicBrainz server, even with the resolver connected', () => {
    mockServerUrls = {};
    mockResolverConnected = true;
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('is closed with a self-hosted server but the resolver not connected', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = false;
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('opens once both are true', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(true);
  });

  // `selfHostedMusicbrainzConfigured` is the broader of the two flags — it
  // tracks only the server half, independent of whether the resolver happens
  // to be connected right now. Callers use the gap between it and
  // `canAcquireAndPlay` to tell "no resolver connected" apart from "this
  // feature area is off entirely" — see the row components' own tests.
  it('exposes the self-hosted-server flag independently of whether the resolver is connected', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = false;
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.selfHostedMusicbrainzConfigured).toBe(true);
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('the self-hosted-server flag is false with no server configured, regardless of the resolver', () => {
    mockServerUrls = {};
    mockResolverConnected = true;
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.selfHostedMusicbrainzConfigured).toBe(false);
  });
});

describe('useAcquireAndPlaySong — already owned', () => {
  it('plays the local copy directly, never touching the resolver', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => song;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockResolvePlayableSong).toHaveBeenCalledWith(song.nativeId);
    expect(mockPlaySong).toHaveBeenCalled();
  });

  it('is checked even when the gate is closed — an owned song always just plays', async () => {
    mockServerUrls = {};
    mockLocalSongImpl = () => song;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockPlaySong).toHaveBeenCalled();
  });

  // Regression: an owned song whose resolve/play genuinely fails used to
  // report `false` with no toast at all — indistinguishable from the tap
  // having done nothing.
  it('toasts an error when an owned song is found but fails to resolve or play', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockLocalSongImpl = () => song;
    mockResolvePlayableSong.mockResolvedValue(null);

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(false);
    expect(mockPlaySong).not.toHaveBeenCalled();
    expect(__getToasts().some(x => x.variant === 'error')).toBe(true);
  });
});

describe('useAcquireAndPlaySong — not owned, gate closed', () => {
  it('does nothing and reports unhandled, so the caller falls back to its own UI', async () => {
    mockServerUrls = {};
    mockLocalSongImpl = () => null;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(false);
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe('useAcquireAndPlaySong — not owned, gate open', () => {
  it('asks the resolver with title, artist and any known external ids', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    const songWithIds = { ...song, externalIds: { mbid: 'mb-1', isrc: 'isrc-1' } };

    const { result } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(songWithIds, albumStub));

    expect(mockResolve).toHaveBeenCalledWith(
      { serverUrl: 'http://nas:5020', apiKey: 'key' },
      { title: song.title, artist: song.artist.name, mbid: 'mb-1', isrc: 'isrc-1' }
    );
  });

  it('plays immediately when the resolver already has it', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve.mockResolvedValue({ status: 'ready', songId: 'nd-song-1' });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockResolvePlayableSong).toHaveBeenCalledWith('nd-song-1');
    expect(mockPlaySong).toHaveBeenCalled();
    // Nothing was ever "downloading" — it was already there.
    expect(__getToasts().some(x => x.variant === 'loading')).toBe(false);
  });

  it('reports a definite failure without starting to poll', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve.mockResolvedValue({ status: 'failed', reason: 'no match found' });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockPlaySong).not.toHaveBeenCalled();
    expect(__getToasts().some(x => x.variant === 'error')).toBe(true);
    expect(__getToasts().some(x => x.variant === 'loading')).toBe(false);
  });

  it('toasts an error and still reports handled when the resolver call itself throws', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(__getToasts().some(x => x.variant === 'error')).toBe(true);
  });

  it('shows a loading toast and starts waiting when the resolver says pending', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve.mockResolvedValue({ status: 'pending', jobId: 'job-1', progress: 0 });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(__getToasts().some(x => x.variant === 'loading')).toBe(true);
    expect(mockPlaySong).not.toHaveBeenCalled();
  });

  // These exercise the polling/timeout machinery end to end. Real timers
  // (not fake ones) on purpose — see the same note in the pre-resolver
  // version of this file: mixing fake timers with the microtask chains
  // inside `tick()` is exactly the kind of interaction that is easy to get
  // subtly wrong without a real test run to check it against.
  const flushMicrotasks = () => act(async () => {
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });

  it('plays as soon as a poll finds the resolver reports ready', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    // First call — inside `acquireAndPlay` itself — still says pending; every
    // call after that (the poll effect's own immediate first tick, which
    // fires as soon as `pending` is set, without waiting a full interval)
    // says ready.
    mockResolve
      .mockResolvedValueOnce({ status: 'pending', jobId: 'job-1', progress: 0 })
      .mockResolvedValue({ status: 'ready', songId: 'nd-song-1' });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));
    expect(mockPlaySong).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(mockResolvePlayableSong).toHaveBeenCalledWith('nd-song-1');
    expect(mockPlaySong).toHaveBeenCalled();
  });

  it('reports a failure surfaced by a later poll, not just the first call', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve
      .mockResolvedValueOnce({ status: 'pending', jobId: 'job-1', progress: 0 })
      .mockResolvedValue({ status: 'failed', reason: 'no match found' });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));
    await flushMicrotasks();

    expect(mockPlaySong).not.toHaveBeenCalled();
    expect(__getToasts().some(x => x.variant === 'error')).toBe(true);
  });

  it('gives up past the deadline with an info toast, not an error', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockResolverConnected = true;
    mockLocalSongImpl = () => null;
    mockResolve.mockResolvedValue({ status: 'pending', jobId: 'job-1', progress: 0 });

    const { result } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(__getToasts().some(x => x.variant === 'loading')).toBe(true);
  });
});

// The interval effect itself (start a poll, clear it on unmount/resolution)
// is ordinary React plumbing; what is actually worth locking down without a
// real test run is the arithmetic that decides *when* to give up — get that
// wrong and either every acquire times out instantly or none ever do.
describe('hasReachedAcquireDeadline', () => {
  const THREE_MINUTES = 3 * 60 * 1000;

  it('has not reached the deadline right after starting', () => {
    expect(hasReachedAcquireDeadline(1_000, 1_000)).toBe(false);
  });

  it('has not reached the deadline a moment before the timeout', () => {
    expect(hasReachedAcquireDeadline(1_000, 1_000 + THREE_MINUTES - 1)).toBe(false);
  });

  it('has reached the deadline exactly at the timeout', () => {
    expect(hasReachedAcquireDeadline(1_000, 1_000 + THREE_MINUTES)).toBe(true);
  });

  it('has reached the deadline well past the timeout', () => {
    expect(hasReachedAcquireDeadline(1_000, 1_000 + THREE_MINUTES + 60_000)).toBe(true);
  });
});
