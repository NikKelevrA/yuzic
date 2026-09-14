import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import playbackReducer from '@/state/redux/slices/playbackSlice'
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice'
import settingsPlaybackReducer, { setResumeLongTracksEnabled } from '@/features/settings/playback/state'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'

// Mocked api adapter — supplies (or withholds) api.bookmarks depending on
// what the test needs. `useApi` is imported by useBookmarkManager. Variables
// referenced from inside jest.mock() are prefixed with `mock` per the
// Jest hoisting rules.
const mockList = jest.fn<Promise<Array<{ songId: string; positionMs: number }>>, []>()
const mockCreate = jest.fn<Promise<void>, [{ songId: string; positionMs: number }]>()
const mockRemove = jest.fn<Promise<void>, [string]>()
const mockBookmarksSupported = { current: true }

jest.mock('@/providers/registry/useApi', () => ({
  useApi: () => ({
    bookmarks: mockBookmarksSupported.current
      ? { list: mockList, create: mockCreate, remove: mockRemove }
      : undefined,
  }),
}))

import { useBookmarkManager } from './useBookmarkManager'

function makeStore(opts?: { resumeEnabled?: boolean; serverId?: string; seededBookmark?: { songId: string; positionMs: number } }) {
  const store = configureStore({
    reducer: combineReducers({
      playback: playbackReducer,
      servers: serversReducer,
      settingsPlayback: settingsPlaybackReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
  if (opts?.serverId) {
    store.dispatch(addServer({
      id: opts.serverId,
      type: 'navidrome',
      serverUrl: 'https://example.com',
      username: 'u',
      salt: '',
      token: '',
      isAuthenticated: true,
    } as any))
    store.dispatch(setActiveServer(opts.serverId))
  }
  if (opts?.resumeEnabled === false) {
    store.dispatch(setResumeLongTracksEnabled(false))
  }
  if (opts?.seededBookmark) {
    store.dispatch({
      type: 'playback/setPlaybackBookmark',
      payload: { songId: opts.seededBookmark.songId, positionMs: opts.seededBookmark.positionMs },
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

/**
 * The local bookmark map is keyed by identity; the server's own bookmark
 * endpoint is called with the origin's id. The two are deliberately different.
 */
const bookmarkId = (nativeId: string) => makeLocalId('song', provenance, nativeId)

function song(id: string, durationSeconds: number): Song {
  return {
    localId: makeLocalId('song', provenance, id),
    nativeId: id,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: 'Track',
    artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'Author', cover: { kind: 'none' } },
    album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Album', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds,
    contentKind: 'song',
    genres: [],
  }
}

const longAudiobook = (id = 'ab'): Song => song(id, 60 * 60) // 60 minutes — over the 20-min bookmark cutoff

const shortSong = (id = 's'): Song => song(id, 180) // 3 minutes — under the cutoff, not bookmarkable

beforeEach(() => {
  mockList.mockReset()
  mockCreate.mockReset()
  mockRemove.mockReset()
  mockBookmarksSupported.current = true
  mockList.mockResolvedValue([])
  mockCreate.mockResolvedValue(undefined)
  mockRemove.mockResolvedValue(undefined)
})

describe('useBookmarkManager', () => {
  it('reports getResumePosition in seconds and returns null for unknown tracks', async () => {
    const store = makeStore({
      serverId: 'server-A',
      seededBookmark: { songId: bookmarkId('ab'), positionMs: 900_000 }, // 15 minutes
    })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    expect(result.current.getResumePosition(bookmarkId('ab'))).toBe(900)
    expect(result.current.getResumePosition(bookmarkId('nope'))).toBeNull()
  })

  it('returns null from getResumePosition when the resume toggle is off', async () => {
    const store = makeStore({
      serverId: 'server-A',
      resumeEnabled: false,
      seededBookmark: { songId: bookmarkId('ab'), positionMs: 900_000 },
    })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    expect(result.current.getResumePosition(bookmarkId('ab'))).toBeNull()
  })

  it('saves a bookmark and mirrors to the server for a long track mid-play', async () => {
    const store = makeStore({ serverId: 'server-A' })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.saveOrClear(longAudiobook('ab'), 900) // 15m in a 60m track
    })

    expect(store.getState().playback.bookmarks[bookmarkId('ab')]?.positionMs).toBe(900_000)
    expect(mockCreate).toHaveBeenCalledWith({ songId: 'ab', positionMs: 900_000 })
  })

  it('does not save a bookmark for a short track', async () => {
    const store = makeStore({ serverId: 'server-A' })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.saveOrClear(shortSong('s'), 60)
    })

    expect(store.getState().playback.bookmarks.s).toBeUndefined()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('clears the bookmark past the near-end cutoff', async () => {
    const store = makeStore({
      serverId: 'server-A',
      seededBookmark: { songId: bookmarkId('ab'), positionMs: 900_000 },
    })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    // 3540s / 3600s = 98.3% — over the 97% cutoff
    await act(async () => {
      await result.current.saveOrClear(longAudiobook('ab'), 3540)
    })

    expect(store.getState().playback.bookmarks[bookmarkId('ab')]).toBeUndefined()
    expect(mockRemove).toHaveBeenCalledWith('ab')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('does nothing when the resume toggle is off, even for a bookmarkable track', async () => {
    const store = makeStore({ serverId: 'server-A', resumeEnabled: false })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.saveOrClear(longAudiobook('ab'), 900)
    })

    expect(store.getState().playback.bookmarks[bookmarkId('ab')]).toBeUndefined()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('does not touch the server when api.bookmarks is absent', async () => {
    mockBookmarksSupported.current = false
    const store = makeStore({ serverId: 'server-A' })
    const { result } = await renderHook(() => useBookmarkManager(), { wrapper: wrapperFor(store) })

    await act(async () => {
      await result.current.saveOrClear(longAudiobook('ab'), 900)
    })

    expect(store.getState().playback.bookmarks[bookmarkId('ab')]?.positionMs).toBe(900_000)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockList).not.toHaveBeenCalled()
  })
})
