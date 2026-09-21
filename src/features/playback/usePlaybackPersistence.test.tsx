import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import { usePlaybackPersistence } from './usePlaybackPersistence'

const mockFlush = jest.fn(() => Promise.resolve())
jest.mock('@/state/redux/flush', () => ({
  flushPersistedState: () => mockFlush(),
}))
import playbackReducer from '@/state/redux/slices/playbackSlice'
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'
import type { PlayableResource } from '@/features/playback/playableResource'

function makeStore(preload?: { activeServerId?: string; persistedServerId?: string | null }) {
  const store = configureStore({
    reducer: combineReducers({
      playback: playbackReducer,
      servers: serversReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
  if (preload?.activeServerId) {
    store.dispatch(addServer({
      id: preload.activeServerId,
      type: 'navidrome',
      serverUrl: 'https://example.com',
      username: 'u',
      salt: '',
      token: '',
      isAuthenticated: true,
    } as any))
    store.dispatch(setActiveServer(preload.activeServerId))
  }
  if (preload?.persistedServerId !== undefined) {
    // Simulate a persisted queue for a different server.
    store.dispatch({
      type: 'playback/setPlaybackQueue',
      payload: {
        activeServerId: preload.persistedServerId,
        queueSongIds: ['a'],
        currentIndex: 0,
        repeatMode: 'off',
        shuffleMode: 'off',
      },
    })
  }
  return store
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  Wrapper.displayName = 'TestStoreWrapper'
  return Wrapper
}

const provenance = serverProvenance('server-A')

const resource = (id: string, contentKind: Song['contentKind'] = 'song'): PlayableResource => ({
  song: {
    localId: makeLocalId('song', provenance, id),
    nativeId: id,
    provenance,
    externalIds: {},
    title: id,
    artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'A', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Al', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds: 120,
    contentKind,
    genres: [],
  },
  streamUrl: `https://example.com/${id}.mp3`,
})

describe('usePlaybackPersistence', () => {
  it('resets the slice when the active server differs from the persisted one', async () => {
    const store = makeStore({ activeServerId: 'server-B', persistedServerId: 'server-A' })

    await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    // The effect fires on mount; the slice should carry server-B and be empty.
    const state = store.getState().playback
    expect(state.activeServerId).toBe('server-B')
    expect(state.queueSongIds).toEqual([])
  })

  it('leaves the slice alone when active and persisted server match', async () => {
    const store = makeStore({ activeServerId: 'server-A', persistedServerId: 'server-A' })

    await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    const state = store.getState().playback
    expect(state.queueSongIds).toEqual(['a'])
  })

  it('filters non-song contentKind out of persistQueue', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    await act(async () => {
      result.current.persistQueue({
        queue: [
          resource('s1'),
          resource('radio-1', 'liveStream'),
          resource('s2'),
          resource('pod-1', 'podcastEpisode'),
        ],
        currentIndex: 3,
        segments: [],
        repeatMode: 'off',
        shuffleMode: 'off',
      })
    })

    const state = store.getState().playback
    expect(state.queueSongIds).toEqual([resource('s1').song.localId, resource('s2').song.localId])
    // currentIndex clamps to the filtered list length
    expect(state.currentIndex).toBe(1)
  })

  it('re-finds the current index after filtering shifts the queue', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    // The dropped item sits *before* the current song, so every clamp-based
    // index lands one track too far down the list.
    await act(async () => {
      result.current.persistQueue({
        queue: [
          resource('radio-1', 'liveStream'),
          resource('s1'),
          resource('s2'),
          resource('s3'),
          resource('s4'),
        ],
        currentIndex: 2,
        segments: [],
        repeatMode: 'off',
        shuffleMode: 'off',
      })
    })

    const state = store.getState().playback
    expect(state.queueSongIds).toEqual(
      ['s1', 's2', 's3', 's4'].map((id) => resource(id).song.localId)
    )
    expect(state.queueSongIds[state.currentIndex]).toBe(resource('s2').song.localId)
  })

  it('remembers which playlist each saved song was queued from', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    // The radio stream isn't saved, and its context has to drop out with it
    // rather than shift every later song onto the wrong collection.
    await act(async () => {
      result.current.persistQueue({
        queue: [resource('radio-1', 'liveStream'), resource('s1'), resource('s2'), resource('s3')],
        segments: [
          { startIndex: 0, length: 1, source: { kind: 'user', contextId: 'radio', contextType: 'adhoc' } },
          { startIndex: 1, length: 2, source: { kind: 'user', contextId: 'pl-1', contextType: 'playlist' } },
          { startIndex: 3, length: 1, source: { kind: 'autoplay-fill', contextId: 'autoplay-3' } },
        ],
        currentIndex: 1,
        repeatMode: 'off',
        shuffleMode: 'off',
      })
    })

    expect(store.getState().playback.queueContexts).toEqual([
      { contextId: 'pl-1', contextType: 'playlist' },
      { contextId: 'pl-1', contextType: 'playlist' },
      null,
    ])
  })

  it('throttles persistPosition writes and honors force', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    const nowSpy = jest.spyOn(Date, 'now')

    // Ref starts at 0, so the first non-forced write only lands once the
    // clock has advanced past the throttle window. Use a real-scale
    // millisecond value so the assertions read like the runtime behaviour.
    const T0 = 10_000_000
    await act(async () => {
      nowSpy.mockReturnValue(T0)
      result.current.persistPosition(1)
    })
    expect(store.getState().playback.positionMs).toBe(1000)

    // A second call inside the 5s throttle window is dropped.
    await act(async () => {
      nowSpy.mockReturnValue(T0 + 1_000)
      result.current.persistPosition(2)
    })
    expect(store.getState().playback.positionMs).toBe(1000)

    // Force bypasses the throttle regardless of the clock.
    await act(async () => {
      nowSpy.mockReturnValue(T0 + 1_500)
      result.current.persistPosition(3, { force: true })
    })
    expect(store.getState().playback.positionMs).toBe(3000)

    // After the throttle window elapses, non-forced writes apply again.
    await act(async () => {
      nowSpy.mockReturnValue(T0 + 7_000)
      result.current.persistPosition(5)
    })
    expect(store.getState().playback.positionMs).toBe(5000)

    nowSpy.mockRestore()
  })
})


describe('persistPosition reaching disk', () => {
  beforeEach(() => mockFlush.mockClear())

  // redux-persist holds the playback slice back for 3 s. A pause followed
  // by a kill inside that window used to restore the position from before
  // the pause — found on Android as a resume about 5 s early.
  it('flushes a forced write (pause, track change) straight to disk', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    await act(async () => { result.current.persistPosition(117.8, { force: true }) })

    expect(store.getState().playback.positionMs).toBe(117800)
    expect(mockFlush).toHaveBeenCalledTimes(1)
  })

  it('leaves the ordinary tick to the persist throttle', async () => {
    const store = makeStore({ activeServerId: 'server-A' })
    const { result } = await renderHook(() => usePlaybackPersistence(), { wrapper: wrapperFor(store) })

    await act(async () => { result.current.persistPosition(12) })

    expect(mockFlush).not.toHaveBeenCalled()
  })
})
