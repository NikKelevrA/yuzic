import React from 'react'
import { act, renderHook } from '@testing-library/react-native'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import type { Server } from '@/providers/contracts/Server'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'
import settingsScrobblingReducer, { setScrobbleRoute } from '@/features/settings/scrobbling/state'
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice'
import listenbrainzReducer, { setUsername } from '@/state/redux/slices/listenbrainzSlice'
import statsReducer from '@/state/redux/slices/statsSlice'
import listeningReducer from '@/state/redux/slices/listeningSlice'
import offlineMutationsReducer from '@/state/redux/slices/offlineMutationsSlice'
import * as listenbrainz from '@/providers/integration/listenbrainz'
import { listenBrainzCredentialScope } from '@/state/redux/selectors/listenbrainzSelectors'
import { setCredential, clearCredentialCache } from '@/state/credentialCache'

const mockSongsApi = {
  get: jest.fn(),
  scrobble: jest.fn(async () => {}),
  reportNowPlaying: jest.fn(async () => {}),
  reportPlaybackProgress: jest.fn(async () => {}),
  reportPlaybackStop: jest.fn(async () => {}),
  buildStreamUrl: jest.fn(() => ''),
  streamableCodecs: ['mp3'] as const,
  scrobbleKind: 'scrobble' as const,
}

jest.mock('@/providers/registry/useApi', () => ({ useApi: () => ({ songs: mockSongsApi }) }))
// Not under test, and its transitive expo-constants import doesn't transform
// in this environment. ListenBrainz is a separate destination with its own
// switch — see the note on queueScrobble.
jest.mock('@/providers/integration/listenbrainz', () => ({
  submitScrobble: jest.fn(async () => {}),
  submitNowPlaying: jest.fn(async () => {}),
}))

import { useScrobbling } from './useScrobbling'

// The ListenBrainz token now lives in credentialCache, not Redux — a
// module-level singleton that would otherwise leak a token set by one test
// (the 'direct' route case below) into every other test reusing the same
// server id ('navidrome-1', etc).
afterEach(() => { clearCredentialCache() })

function serverOf(type: Server['type']): Server {
  return {
    id: `${type}-1`,
    type,
    serverUrl: 'https://media.example',
    username: 'ari',
    auth: type === 'navidrome' ? { password: 'pw' } : { token: 'tok', userId: 'u1' },
    isAuthenticated: true,
  }
}

function makeStore(server: Server) {
  const store = configureStore({
    reducer: combineReducers({
      settingsScrobbling: settingsScrobblingReducer,
      servers: serversReducer,
      listenbrainz: listenbrainzReducer,
      stats: statsReducer,
      listening: listeningReducer,
      offlineMutations: offlineMutationsReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
  store.dispatch(addServer(server))
  store.dispatch(setActiveServer(server.id))
  return store
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  Wrapper.displayName = 'TestStoreWrapper'
  return Wrapper
}

const provenance = serverProvenance('srv-1')

const song: Song = {
  localId: makeLocalId('song', provenance, 's1'),
  nativeId: 's1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: 'Roygbiv',
  artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'Boards of Canada', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Album', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 200,
  contentKind: 'song',
  genres: [],
}

/**
 * Scrobbling used to branch on `activeServer.type` and, for Navidrome, call
 * the Subsonic endpoint directly with raw credentials instead of going through
 * the adapter. That copy was built without a serverId, so it never got URL
 * failover: away from home, on a fallback address, every scrobble was aimed at
 * the unreachable primary. These pin the routing to the adapter for every
 * provider.
 */
describe('scrobble routing', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it.each(['navidrome', 'jellyfin', 'emby'] as const)(
    'records a finished listen through the adapter on %s',
    async (type) => {
      const store = makeStore(serverOf(type))
      const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

      await act(async () => {
        await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
      })

      expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s1', 1_700_000_000)
    }
  )

  it.each(['navidrome', 'jellyfin', 'emby'] as const)(
    'announces now-playing through the adapter on %s',
    async (type) => {
      const store = makeStore(serverOf(type))
      const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

      await act(async () => { result.current.submitNowPlaying(song) })

      expect(mockSongsApi.reportNowPlaying).toHaveBeenCalledWith('s1')
    }
  )

  it('leaves a listen too short to count alone', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 5, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
  })

  it('parks a failed scrobble in the offline queue rather than dropping it', async () => {
    mockSongsApi.scrobble.mockRejectedValueOnce(new Error('unreachable'))
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    const queued = store.getState().offlineMutations.queue
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ type: 'scrobble', songId: 's1', destination: 'server' })
  })
})

/**
 * D1: useScrobbling reads the per-destination route (Disabled /
 * Through-server / Direct) rather than the old two independent booleans.
 * These pin the routing decisions the hook makes off that route, including
 * that ListenBrainz's 'direct' route reaches the ListenBrainz API directly
 * while never also calling the server adapter for that same destination.
 */
describe('scrobble route dispatch', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('routes to the server adapter when listenbrainz route is through-server', async () => {
    const server = serverOf('navidrome')
    const store = makeStore(server)
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'through-server' }))
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'disabled' }))

    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s1', 1_700_000_000)
  })

  it('routes nothing when both destinations are disabled', async () => {
    const server = serverOf('navidrome')
    const store = makeStore(server)
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'disabled' }))
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'disabled' }))

    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
  })

  it('a lastfm route of through-server also drives the server adapter, with no direct option ever offered for it', async () => {
    const server = serverOf('navidrome')
    const store = makeStore(server)
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'through-server' }))
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'disabled' }))

    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s1', 1_700_000_000)
    // ScrobbleRoute type has no 'direct' value usable for 'lastfm' — enforced
    // at the type level, not just by this test's absence of a dispatch.
  })

  it('routes to ListenBrainz directly, and never also to the server, when its route is direct', async () => {
    const server = serverOf('navidrome')
    const store = makeStore(server)
    store.dispatch(setUsername({ serverId: server.id, value: 'ari' }))
    await setCredential(listenBrainzCredentialScope(server.id), 'token', 'tok')
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'direct' }))
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'disabled' }))

    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(listenbrainz.submitScrobble).toHaveBeenCalled()
    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
  })
})

/**
 * The history is not the scrobble, and the difference is the skips.
 *
 * Scrobbling reports outward under thresholds set by Last.fm and by servers.
 * The listening log records what happened, locally, under none — so the
 * listens scrobbling declines to report are exactly the ones it must keep.
 */
describe('listening history', () => {

  it('records a skip that is far too short to scrobble', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 20, startTime: 1_700_000_000 })
    })

    const state = store.getState().listening
    expect(state.events).toHaveLength(1)
    expect(state.events[0]).toMatchObject({ ending: 'skipped', seconds: 20 })
    // Keyed by the song's own provenance, not the active server — see
    // `relatedKey` for why those are allowed to differ.
    expect(state.totals[`srv-1:${song.nativeId}`]).toMatchObject({
      starts: 1, plays: 0, rejections: 1,
    })
    // And nothing was reported outward, which is the existing behaviour.
    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
  })

  it('records a full listen as finished, alongside the scrobble', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 240, startTime: 1_700_000_000 })
    })

    expect(store.getState().listening.events[0]).toMatchObject({ ending: 'finished' })
    expect(mockSongsApi.scrobble).toHaveBeenCalled()
  })

  /**
   * The outgoing-departure report can arrive twice for one listen, and the
   * scrobble guard beside this one does not cover it — that ref is only set
   * once a listen passes the threshold, so it never guards a skip at all.
   * Two events for one departure is a doubled play count.
   */
  it('writes one event when the same departure is reported twice', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
    })

    expect(store.getState().listening.events).toHaveLength(1)
  })

  /**
   * The distinction the whole `ListenEnding` type exists for, and it was
   * declared for a while with nothing able to produce it.
   *
   * A lost stream looks exactly like somebody pressing next — same position,
   * same departure — so only the error path can tell them apart. Without it,
   * every dropped connection is filed as a skip, and a skip past eight seconds
   * is a rejection: the app concludes the listener dislikes whatever was
   * playing when their network went, and mislearns hardest about the people
   * with the worst connections.
   */
  it('records a failed track as interrupted, not as a skip', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      result.current.markInterrupted(song.nativeId)
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
    })

    const state = store.getState().listening
    expect(state.events[0].ending).toBe('interrupted')
    // And so it is not held against the track.
    expect(state.totals[`srv-1:${song.nativeId}`].rejections).toBe(0)
  })

  it('only excuses the track that actually failed', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      result.current.markInterrupted('some-other-track')
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
    })

    expect(store.getState().listening.events[0].ending).toBe('skipped')
  })

  /**
   * One failure excuses one listen. Left set, it would quietly forgive every
   * skip after a single network blip, which is the same fault in the other
   * direction — the app would stop learning anything from skips at all.
   */
  it('does not excuse the next track as well', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      result.current.markInterrupted(song.nativeId)
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_900 })
    })

    const endings = store.getState().listening.events.map(e => e.ending)
    expect(endings).toEqual(['interrupted', 'skipped'])
  })

  it('treats the same song started again as a second listen', async () => {
    const store = makeStore(serverOf('navidrome'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_000 })
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 30, startTime: 1_700_000_900 })
    })

    expect(store.getState().listening.events).toHaveLength(2)
  })
})
