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
import { finishListen, observePosition, observeSeek, resetListen } from './listenMeter'

// The ListenBrainz token now lives in credentialCache, not Redux — a
// module-level singleton that would otherwise leak a token set by one test
// (the 'direct' route case below) into every other test reusing the same
// server id ('navidrome-1', etc).
afterEach(() => { clearCredentialCache() })
// The meter is a module singleton, like the player it measures. Left dirty it
// would carry one test's heard seconds into the next.
beforeEach(() => { resetListen() })

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

/**
 * The incident.
 *
 * `Stopped` was sent from inside the scrobble's success branch, after
 * `markPlayed`, so it inherited every reason that branch had not to run: a
 * skip below the threshold sent none, a track whose route had been switched
 * off mid-play sent none, and a departure that failed to scrobble sent none.
 * What that left behind is not cosmetic. The server kept showing a
 * `NowPlayingItem` for a track nobody was playing, its position frozen at the
 * last tick it heard — and, because Jellyfin's and Emby's Last.fm and
 * ListenBrainz plugins scrobble on `PlaybackStopped` and on nothing else, the
 * one event that *is* the scrobble on those servers was the event being
 * withheld.
 *
 * The rule these pin is symmetry, not a second condition: whatever opened a
 * session closes it, and nothing else ever sends a stop.
 */
describe('server session reporting', () => {
  beforeEach(() => { jest.clearAllMocks() })

  async function playing(store: ReturnType<typeof makeStore>) {
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => { result.current.submitNowPlaying(song) })
    return result
  }

  it('sends Stopped on a skip far below the scrobble threshold', async () => {
    const result = await playing(makeStore(serverOf('jellyfin')))

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 20, startTime: 1_700_000_000 })
    })

    // Twenty seconds of a two hundred second track earns no scrobble, and
    // that was never a reason to leave the session open.
    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledWith('s1', 20_000)
  })

  it('sends Stopped for a session whose route was switched off mid-track', async () => {
    const server = serverOf('jellyfin')
    const store = makeStore(server)
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => { result.current.submitNowPlaying(song) })

    // The listener opens Settings mid-song and turns scrobbling off. The
    // session they already have on the server is still theirs to close.
    await act(async () => {
      store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'disabled' }))
      store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'disabled' }))
    })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledWith('s1', 180_000)
  })

  it('never opens or closes a session when nothing is routed through the server', async () => {
    const server = serverOf('jellyfin')
    const store = makeStore(server)
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'lastfm', route: 'disabled' }))
    store.dispatch(setScrobbleRoute({ serverId: server.id, destination: 'listenbrainz', route: 'disabled' }))

    const result = await playing(store)
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    // The session events *are* the scrobble on these servers — the plugins
    // fire on Stopped. Sending one "because it isn't scrobbling" would
    // scrobble to Last.fm for somebody who switched scrobbling off, and
    // announcing now-playing would name their track to the server's admin.
    // Nothing was opened, so there is nothing to close.
    expect(mockSongsApi.reportNowPlaying).not.toHaveBeenCalled()
    expect(mockSongsApi.reportPlaybackStop).not.toHaveBeenCalled()
  })

  it('sends one Stopped when the same departure is reported twice', async () => {
    const result = await playing(makeStore(serverOf('jellyfin')))

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 20, startTime: 1_700_000_000 })
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 20, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledTimes(1)
  })

  /**
   * `markPlayed` resets the server's stored position. Run after the stop, it
   * would wipe the position the stop just reported, so the order is not a
   * matter of taste. It is also the one call that must not happen twice: it
   * is what the Settings row promises when it says "mark as played".
   */
  it('marks played once, and before the stop that carries the position', async () => {
    const result = await playing(makeStore(serverOf('jellyfin')))

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).toHaveBeenCalledTimes(1)
    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledTimes(1)
    expect(mockSongsApi.scrobble.mock.invocationCallOrder[0])
      .toBeLessThan(mockSongsApi.reportPlaybackStop.mock.invocationCallOrder[0])
  })

  it('still closes the session when the scrobble itself fails', async () => {
    mockSongsApi.scrobble.mockRejectedValueOnce(new Error('unreachable'))
    const result = await playing(makeStore(serverOf('jellyfin')))

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 180, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledWith('s1', 180_000)
  })
})

/**
 * Two numbers were being carried under one name. The playhead answers "where
 * were they" — the resume point, and whether the track ran out. Listened time
 * answers "how much did they hear" — which is what every scrobble threshold in
 * the world is written against. They diverge the moment anyone rewinds.
 */
describe('which quantity goes where', () => {
  beforeEach(() => { jest.clearAllMocks() })

  /** Heard `listened` seconds of the track, and left the playhead at `leftAt`. */
  function heard(songId: string, listened: number, leftAt: number) {
    observePosition(0)
    for (let credited = 0; credited < listened; credited += 10) {
      // Ten seconds of play, then a rewind to where it started. The rewind
      // itself credits nothing, so heard time climbs while the playhead does
      // not run away.
      observePosition(10)
      observeSeek(10, 0)
    }
    // Park the playhead where they left it, without crediting the move.
    observeSeek(0, leftAt)
    finishListen(songId, leftAt)
  }

  it('scrobbles on time heard, not on where the playhead stopped', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => { result.current.submitNowPlaying(song) })

    // Three minutes of a two hundred second track, all of it in the first ten
    // seconds, left at 0:10. The threshold is 100s: on listened time this is a
    // scrobble, on the playhead it is not — and it was not, before this.
    heard(song.nativeId, 180, 10)
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 10, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s1', 1_700_000_000)
    // ...and the position on the wire is still the playhead, because that is
    // what the field means on the server: it sets the resume point and, past
    // ninety percent, the played flag.
    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledWith('s1', 10_000)
  })

  it('records the heard time in the history and judges the ending by the playhead', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    heard(song.nativeId, 180, 10)
    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 10, startTime: 1_700_000_000 })
    })

    const event = store.getState().listening.events[0]
    expect(event.seconds).toBe(180)
    // Heard nearly the whole track and still walked out at 0:10. That is a
    // skip; reading the ending off heard time would have called it finished.
    expect(event.ending).toBe('skipped')
  })

  it('falls back to the playhead for a departure the meter never saw', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(song, { listenedSeconds: 150, startTime: 1_700_000_000 })
    })

    // A path that does not feed the meter behaves exactly as it did before the
    // meter existed, rather than reporting that nothing was heard.
    expect(store.getState().listening.events[0].seconds).toBe(150)
    expect(mockSongsApi.scrobble).toHaveBeenCalled()
  })
})

/**
 * Last.fm and ListenBrainz both refuse a track shorter than thirty seconds.
 * Without a floor, the threshold does something quietly absurd: a ten-second
 * interlude needs five seconds to "pass", so every album's spoken intro
 * scrobbled itself on the way past and every one of those submissions was
 * discarded at the far end. The app said it had reported a play; the service
 * had recorded nothing.
 */
describe('minimum track length', () => {
  beforeEach(() => { jest.clearAllMocks() })

  const interlude: Song = { ...song, nativeId: 's-short', durationSeconds: 10 }

  it('never scrobbles a track under thirty seconds, however much of it was heard', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => { result.current.submitNowPlaying(interlude) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(interlude, { listenedSeconds: 10, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).not.toHaveBeenCalled()
    expect(listenbrainz.submitScrobble).not.toHaveBeenCalled()
  })

  it('still records it in the history, and still closes the session', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    await act(async () => { result.current.submitNowPlaying(interlude) })

    await act(async () => {
      await result.current.scrobbleIfNeeded(interlude, { listenedSeconds: 10, startTime: 1_700_000_000 })
    })

    // Somebody else's submission rule is no reason for the app to forget what
    // happened, or to leave a session hanging.
    expect(store.getState().listening.events[0]).toMatchObject({ seconds: 10, ending: 'finished' })
    expect(mockSongsApi.reportPlaybackStop).toHaveBeenCalledWith('s-short', 10_000)
  })

  it('still scrobbles a track of exactly thirty seconds', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    const short: Song = { ...song, nativeId: 's-30', durationSeconds: 30 }

    await act(async () => {
      await result.current.scrobbleIfNeeded(short, { listenedSeconds: 20, startTime: 1_700_000_000 })
    })

    expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s-30', 1_700_000_000)
  })

  it('treats an unknown duration as unknown rather than as too short', async () => {
    const store = makeStore(serverOf('jellyfin'))
    const { result } = await renderHook(() => useScrobbling(), { wrapper: wrapperFor(store) })
    const unknown: Song = { ...song, nativeId: 's-unknown', durationSeconds: 0 }

    await act(async () => {
      await result.current.scrobbleIfNeeded(unknown, { listenedSeconds: 300, startTime: 1_700_000_000 })
    })

    // Four minutes is the arm of the threshold that handles a length the
    // server never told us.
    expect(mockSongsApi.scrobble).toHaveBeenCalledWith('s-unknown', 1_700_000_000)
  })
})
