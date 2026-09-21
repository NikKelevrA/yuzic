import React from 'react'
import { AppState } from 'react-native'
import { renderHook, act } from '@testing-library/react-native'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'
import type { PlayableResource } from '@/features/playback/playableResource'
import serversReducer, { addServer, setActiveServer, setCredentialsHydrated } from '@/state/redux/slices/serversSlice'

const mockProgress = { position: 0, duration: 200, buffered: 0 }
jest.mock('@/features/player/activeBackend', () => ({
  getBackend: () => ({ getProgress: () => mockProgress }),
}))

import { usePlaybackPersistenceSync } from './usePlaybackPersistenceSync'
import { clearListenCheckpoint, readListenCheckpoint, saveListenCheckpoint } from './listenCheckpoint'
import { resetListen } from './listenMeter'
import type { PlaybackSession, PlaybackSnapshot } from './playbackSession'
import type { PlaybackServices } from './usePlaybackServices'

const provenance = serverProvenance('srv-1')

const song: Song = {
  localId: makeLocalId('song', provenance, 's1'),
  nativeId: 's1',
  provenance,
  externalIds: {},
  title: 'Roygbiv',
  artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'Boards of Canada', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Album', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 200,
  contentKind: 'song',
  genres: [],
}

const resource = { song, streamUrl: 'https://media.example/s1' } as PlayableResource

function makeStore() {
  const store = configureStore({
    reducer: combineReducers({ servers: serversReducer }),
    middleware: getDefault => getDefault({ serializableCheck: false }),
  })
  store.dispatch(addServer({
    id: 'srv-1',
    type: 'jellyfin',
    serverUrl: 'https://media.example',
    username: 'ari',
    auth: { token: 'tok', userId: 'u1' },
    isAuthenticated: true,
  } as never))
  store.dispatch(setActiveServer('srv-1'))
  store.dispatch(setCredentialsHydrated(true))
  return store
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  Wrapper.displayName = 'TestStoreWrapper'
  return Wrapper
}

function makeHarness(overrides: { sessionOpen?: boolean } = {}) {
  const reportPlaybackProgress = jest.fn()
  const scrobble = jest.fn(async () => {})
  const adoptOpenServerSession = jest.fn()
  const persistPosition = jest.fn()

  const session = {
    currentResource: () => resource,
    repeatMode: () => 'off' as const,
    queue: () => [resource],
    segments: () => [],
    currentIndex: () => 0,
    shuffleMode: () => 'off' as const,
    listenStartedAt: () => 1_700_000_000,
    markNewListen: jest.fn(),
    setIsPlaying: jest.fn(),
  } as unknown as PlaybackSession

  const services = {
    persistence: {
      current: {
        persistPosition,
        persistRepeatMode: jest.fn(),
        persistShuffleMode: jest.fn(),
        persistQueue: jest.fn(),
      },
    },
    nowPlaying: { current: jest.fn() },
    scrobble: { current: scrobble },
    reportPlaybackProgress,
    resetLastScrobbled: jest.fn(),
    hasOpenServerSession: () => overrides.sessionOpen ?? true,
    adoptOpenServerSession,
  } as unknown as PlaybackServices

  const loaded = { currentSong: song, repeatMode: 'off', shuffleMode: 'off', queueVersion: 0 } as PlaybackSnapshot
  const empty = { ...loaded, currentSong: null } as PlaybackSnapshot

  return { session, services, loaded, empty, reportPlaybackProgress, scrobble, adoptOpenServerSession }
}

type Harness = ReturnType<typeof makeHarness>

/**
 * Fake timers are installed before anything renders, so the heartbeat's
 * interval is drivable — an interval created under real timers is one no test
 * can advance. `renderHook` is awaited because effects flush inside that
 * promise, and an un-awaited render is a hook whose effects have not run.
 */
async function mount(harness: Harness, isPlaying: boolean, { load = true } = {}) {
  return renderHook(
    () => usePlaybackPersistenceSync({
      session: harness.session,
      snapshot: load ? harness.loaded : harness.empty,
      isPlaying,
      services: harness.services,
      scrobbleOutgoing: async () => {},
    }),
    { wrapper: wrapperFor(makeStore()) }
  )
}

const tick = async () => { await act(async () => { jest.advanceTimersByTime(10_000) }) }

beforeEach(() => {
  jest.useFakeTimers()
  mockProgress.position = 0
  clearListenCheckpoint()
  resetListen()
})
afterEach(() => { jest.useRealTimers() })

/**
 * `isPaused` was a parameter nothing could ever set. The caller passed a
 * literal `false`, and the heartbeat that would have carried a `true` stopped
 * the moment playback did — so the server was never told about a pause by
 * either route, and went on showing a track running that had been sitting
 * still for twenty minutes.
 */
describe('pause reporting', () => {
  it('tells the server the track is paused, and keeps saying so', async () => {
    const harness = makeHarness()
    mockProgress.position = 42
    await mount(harness, false)

    await tick()

    expect(harness.reportPlaybackProgress).toHaveBeenCalledWith(song, 42_000, true)
  })

  it('reports an unpaused tick as playing', async () => {
    const harness = makeHarness()
    mockProgress.position = 42
    await mount(harness, true)

    await tick()

    expect(harness.reportPlaybackProgress).toHaveBeenCalledWith(song, 42_000, false)
  })

  it('stops ticking only when there is nothing loaded at all', async () => {
    const harness = makeHarness()
    await mount(harness, false, { load: false })

    await act(async () => { jest.advanceTimersByTime(30_000) })

    expect(harness.reportPlaybackProgress).not.toHaveBeenCalled()
  })
})

/**
 * A track still playing when the process ends never departs, so it reported
 * nothing at all: no scrobble however long it had played, and no `Stopped`,
 * which leaves the server holding a `NowPlayingItem` nobody is listening to.
 * Backgrounding is the last moment anything of ours is guaranteed to run, so
 * it is where the record is written — and writing a record is all it does.
 */
describe('the listen in flight', () => {
  async function background() {
    const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls
    const handler = calls[calls.length - 1][1]
    await act(async () => { handler('background') })
  }

  it('writes down the listen when the app goes to the background', async () => {
    const harness = makeHarness()
    mockProgress.position = 77
    await mount(harness, true)

    await background()

    expect(readListenCheckpoint()).toMatchObject({
      serverId: 'srv-1',
      startedAt: 1_700_000_000,
      positionSeconds: 77,
      sessionOpen: true,
      song: { nativeId: 's1' },
    })
  })

  it('reports nothing on backgrounding', async () => {
    const harness = makeHarness()
    mockProgress.position = 77
    await mount(harness, true)

    await background()

    // Locking the phone with music playing backgrounds the app several times
    // an hour. A `Stopped` on each one would end the session, blank the
    // server's dashboard and hand the scrobbler plugins a listen per
    // screen-lock.
    expect(harness.scrobble).not.toHaveBeenCalled()
    expect(harness.reportPlaybackProgress).not.toHaveBeenCalled()
  })

  it('keeps the record no more than a heartbeat stale', async () => {
    const harness = makeHarness()
    mockProgress.position = 30
    await mount(harness, true)

    await tick()

    expect(readListenCheckpoint()).toMatchObject({ positionSeconds: 30 })
  })

  it('records that no session was open when scrobbling is off', async () => {
    const harness = makeHarness({ sessionOpen: false })
    mockProgress.position = 30
    await mount(harness, true)

    await background()

    // Nothing was announced to the server, so the next launch must not reach
    // for it either.
    expect(readListenCheckpoint()).toMatchObject({ sessionOpen: false })
  })
})

describe('finishing a listen the last run could not', () => {
  const checkpoint = {
    serverId: 'srv-1',
    startedAt: 1_699_000_000,
    positionSeconds: 120,
    listenedSeconds: 150,
    sessionOpen: true,
    song,
  }

  it('replays it through the ordinary departure path', async () => {
    saveListenCheckpoint(checkpoint)
    const harness = makeHarness()
    await mount(harness, false)

    // The playhead it left off at, reported as a departure — same threshold,
    // same history entry, same offline queue as any other.
    expect(harness.scrobble).toHaveBeenCalledWith(song, {
      listenedSeconds: 120,
      startTime: 1_699_000_000,
    })
  })

  it('adopts the session the dead process opened, so the stop is allowed', async () => {
    saveListenCheckpoint(checkpoint)
    const harness = makeHarness()
    await mount(harness, false)

    expect(harness.adoptOpenServerSession).toHaveBeenCalledWith('s1')
  })

  it('does not reach for a session that was never opened', async () => {
    saveListenCheckpoint({ ...checkpoint, sessionOpen: false })
    const harness = makeHarness()
    await mount(harness, false)

    expect(harness.adoptOpenServerSession).not.toHaveBeenCalled()
  })

  it('replays nothing when the last run departed cleanly', async () => {
    const harness = makeHarness()
    await mount(harness, false)

    expect(harness.scrobble).not.toHaveBeenCalled()
  })

  it('discards a record belonging to a server that is no longer active', async () => {
    saveListenCheckpoint({ ...checkpoint, serverId: 'some-other-server' })
    const harness = makeHarness()
    await mount(harness, false)

    // Its ids mean something else on this server, and its listen belongs to
    // somebody else's history.
    expect(harness.scrobble).not.toHaveBeenCalled()
    expect(readListenCheckpoint()).toBeNull()
  })

  it('replays once, not on every render', async () => {
    saveListenCheckpoint(checkpoint)
    const harness = makeHarness()
    const rendered = await mount(harness, false)

    await act(async () => { rendered.rerender(undefined) })
    await act(async () => { rendered.rerender(undefined) })

    // A return from the background is not a launch. It does not remount, so
    // it never reaches this — which is what keeps a screen-lock from being
    // reported as a second listen.
    expect(harness.scrobble).toHaveBeenCalledTimes(1)
  })
})
