import { renderHook, act } from '@testing-library/react-native';

import { useAcquireAndPlaySong, hasReachedAcquireDeadline } from './useAcquireAndPlaySong';
import { __resetToasts, __getToasts } from '@/components/toast/notify';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && Object.keys(opts).length ? `${key}:${JSON.stringify(opts)}` : key;

/* eslint-disable no-var -- hoisted for the jest.mock factories below */
var mockServerUrls: { musicbrainz?: string } = {};
var mockTrackDownloaders: unknown[] = [];
var mockAlbumDownloaders: unknown[] = [];
var mockLocalSongImpl: (song: unknown) => unknown = () => null;
var mockResolvePlayableSong = jest.fn();
var mockPlaySong = jest.fn();
var mockStartScan = jest.fn();
var mockSync = jest.fn();
var mockRunGet = jest.fn();
/* eslint-enable no-var */

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }));
jest.mock('@/features/settings/sources/useSelfHostedMusicbrainzConfigured', () => ({
  useSelfHostedMusicbrainzConfigured: () => !!mockServerUrls.musicbrainz?.trim(),
}));
jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({ auth: { startScan: mockStartScan } }) }));
jest.mock('@/features/library/useSync', () => ({ useSync: () => ({ sync: mockSync }) }));
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
  useDownloadersForUnit: (unit: 'track' | 'album') =>
    unit === 'track' ? mockTrackDownloaders : mockAlbumDownloaders,
}));
jest.mock('./runGet', () => ({ runGet: (...args: unknown[]) => mockRunGet(...args) }));

const song = {
  localId: 'local:song:1',
  nativeId: 'n1',
  title: 'Numb',
  artist: { name: 'Linkin Park' },
} as never;

const albumStub = { localId: 'local:album:1', nativeId: 'a1', title: 'Meteora', artist: { name: 'Linkin Park' } } as never;

const trackDownloader = { def: { id: 'slskd', downloadTrack: jest.fn() }, config: {} };
const albumOnlyDownloader = { def: { id: 'lidarr', downloadAlbum: jest.fn() }, config: {} };

beforeEach(() => {
  jest.useRealTimers();
  __resetToasts();
  mockServerUrls = {};
  mockTrackDownloaders = [];
  mockAlbumDownloaders = [];
  mockLocalSongImpl = () => null;
  mockResolvePlayableSong.mockReset().mockResolvedValue({ song });
  mockPlaySong.mockReset().mockResolvedValue(undefined);
  mockStartScan.mockReset().mockResolvedValue(undefined);
  mockSync.mockReset().mockResolvedValue(undefined);
  mockRunGet.mockReset().mockResolvedValue(true);
});

describe('useAcquireAndPlaySong — the gate', () => {
  it('is closed with no self-hosted MusicBrainz server, even with a downloader connected', () => {
    mockServerUrls = {};
    mockTrackDownloaders = [trackDownloader];
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('is closed with a self-hosted server but no downloader connected', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('opens once both are true, a track-only downloader counting same as an album-only one', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockAlbumDownloaders = [albumOnlyDownloader];
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.canAcquireAndPlay).toBe(true);
  });

  // `selfHostedMusicbrainzConfigured` is the broader of the two flags — it
  // tracks only the server half, independent of whether a downloader happens
  // to be connected right now. Callers use the gap between it and
  // `canAcquireAndPlay` to tell "no downloader connected" apart from "this
  // feature area is off entirely" — see the row components' own tests.
  it('exposes the self-hosted-server flag independently of whether a downloader is connected', () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [];
    mockAlbumDownloaders = [];
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.selfHostedMusicbrainzConfigured).toBe(true);
    expect(result.current.canAcquireAndPlay).toBe(false);
  });

  it('the self-hosted-server flag is false with no server configured, regardless of downloaders', () => {
    mockServerUrls = {};
    mockTrackDownloaders = [trackDownloader];
    const { result } = renderHook(() => useAcquireAndPlaySong());
    expect(result.current.selfHostedMusicbrainzConfigured).toBe(false);
  });
});

describe('useAcquireAndPlaySong — already owned', () => {
  it('plays the local copy directly, never touching a downloader', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [trackDownloader];
    mockLocalSongImpl = () => song;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockRunGet).not.toHaveBeenCalled();
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
});

describe('useAcquireAndPlaySong — not owned, gate closed', () => {
  it('does nothing and reports unhandled, so the caller falls back to its own UI', async () => {
    mockServerUrls = {};
    mockLocalSongImpl = () => null;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(false);
    expect(mockRunGet).not.toHaveBeenCalled();
  });
});

describe('useAcquireAndPlaySong — not owned, gate open', () => {
  it('sends the track itself to a track-capable downloader, in preference to the album', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [trackDownloader];
    mockAlbumDownloaders = [albumOnlyDownloader];
    mockLocalSongImpl = () => null;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(handled).toBe(true);
    expect(mockRunGet).toHaveBeenCalledWith(expect.objectContaining({
      downloader: trackDownloader,
      track: { title: song.title, artist: song.artist.name },
    }));
    expect(__getToasts().some(x => x.variant === 'loading')).toBe(true);
  });

  it('falls back to the whole album for an album-only downloader (Lidarr) with no track unit', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockAlbumDownloaders = [albumOnlyDownloader];
    mockLocalSongImpl = () => null;

    const { result } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(mockRunGet).toHaveBeenCalledWith(expect.objectContaining({
      downloader: albumOnlyDownloader,
      album: albumStub,
    }));
    expect(mockRunGet.mock.calls[0][0].track).toBeUndefined();
  });

  it('reports handled without waiting when runGet itself fails to send', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [trackDownloader];
    mockLocalSongImpl = () => null;
    mockRunGet.mockResolvedValue(false);

    const { result } = renderHook(() => useAcquireAndPlaySong());
    const handled = await act(() => result.current.acquireAndPlay(song, albumStub));

    // runGet already reported the failure through its own toast; this hook
    // must not also start polling for a download that was never sent.
    expect(handled).toBe(true);
    expect(__getToasts().some(x => x.variant === 'loading')).toBe(false);
  });

  // These two exercise the polling/timeout machinery end to end. Real timers
  // (not fake ones) on purpose: mixing fake timers with the microtask chains
  // inside `tick()` (two `await`s deep) is exactly the kind of interaction
  // that is easy to get subtly wrong without a real test run to check it
  // against, where a short real-time budget with genuinely small constants
  // is not. `POLL_INTERVAL_MS`/`ACQUIRE_TIMEOUT_MS` themselves stay real
  // (12s / 3min) — these tests only prove the *shape* of the behaviour by
  // driving `pending` state directly rather than waiting on the hook's own
  // clock.

  // Flushes the microtask chain a fire-and-forget `.then(...)` inside an
  // effect leaves dangling — `playLocal` is two `await`s deep
  // (`resolvePlayableSong`, then `playSong`), and neither a sync `act()` nor
  // a single `await Promise.resolve()` is reliably enough turns of the queue
  // to drain both.
  const flushMicrotasks = () => act(async () => {
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });

  it('plays as soon as the library resolves the song', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [trackDownloader];
    mockLocalSongImpl = () => null;

    const { result, rerender } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));

    expect(mockPlaySong).not.toHaveBeenCalled();

    // The library now resolves it — the same change a completed sync would
    // cause by handing `useLocalFirst` fresh data (see the hook's own doc
    // comment on why the "did it arrive" check is a render-reactive effect
    // rather than an async loop holding a stale snapshot).
    mockLocalSongImpl = () => song;
    act(() => { rerender(); });
    await flushMicrotasks();

    expect(mockResolvePlayableSong).toHaveBeenCalledWith(song.nativeId);
    expect(mockPlaySong).toHaveBeenCalled();
  });

  it('does not keep asking once resolved — a later rerender does not replay it', async () => {
    mockServerUrls = { musicbrainz: 'http://nas:5000' };
    mockTrackDownloaders = [trackDownloader];
    mockLocalSongImpl = () => null;

    const { result, rerender } = renderHook(() => useAcquireAndPlaySong());
    await act(() => result.current.acquireAndPlay(song, albumStub));

    mockLocalSongImpl = () => song;
    act(() => { rerender(); });
    await flushMicrotasks();
    expect(mockPlaySong).toHaveBeenCalledTimes(1);

    act(() => { rerender(); });
    await flushMicrotasks();
    expect(mockPlaySong).toHaveBeenCalledTimes(1);
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
