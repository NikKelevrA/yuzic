import React from 'react'
import { act, renderHook } from '@testing-library/react-native'
import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'

import settingsSourcesReducer, { setSourceUse } from '@/features/settings/sources/state'

/**
 * A stand-in for react-query that does the one thing under test: run the
 * query function when `enabled` says so, and not otherwise. The real client
 * is deliberately not mounted here — rendering one in this jest environment
 * leaves the worker alive after the run — and what these tests are about is
 * the flag we hand it, not what it does with it.
 */
jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled?: boolean; queryFn: () => unknown }) => {
    mockQueryOptions.push(options)
    const enabled = options.enabled !== false
    if (enabled) void options.queryFn()
    return { data: undefined, isLoading: enabled }
  },
}))

jest.mock('@/providers/integration/musicbrainz', () => ({
  searchArtist: jest.fn(async () => [{ id: 'mbid-1', name: 'Boards of Canada' }]),
}))
jest.mock('@/providers/integration/listenbrainz/recommendations/getSimilarArtists', () => ({
  getLBSimilarArtists: jest.fn(async () => [{ artistMbid: 'mbid-2', name: 'Bibio' }]),
}))
jest.mock('@/providers/integration/lastfm/getSimilarArtists', () => ({
  getLastFmSimilarArtists: jest.fn(async () => [{ name: 'Bibio', mbid: 'mbid-2' }]),
}))
jest.mock('@/constants/keys', () => ({ LASTFM_API_KEY: 'test-key' }))
jest.mock('@/providers/integration/deezer', () => ({
  resolveDeezerArtistByName: jest.fn(async (name: string) => ({
    name,
    cover: { kind: 'url', url: `https://img.example/${name}.jpg` },
  })),
}))
// A switched-on use is also gated on being online; the library's own mock
// reports a connected device.
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js')
)

/* eslint-disable no-var -- hoisted for the jest.mock factory above */
var mockQueryOptions: Record<string, unknown>[] = []
/* eslint-enable no-var */

import { searchArtist } from '@/providers/integration/musicbrainz'
import { getLBSimilarArtists } from '@/providers/integration/listenbrainz/recommendations/getSimilarArtists'
import { getLastFmSimilarArtists } from '@/providers/integration/lastfm/getSimilarArtists'
import { resolveDeezerArtistByName } from '@/providers/integration/deezer'
import { useArtistMbid } from './useArtistMbid'
import { useLBSimilarArtists } from './useLBSimilarArtists'
import { useSimilarArtists } from './useSimilarArtists'

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      settingsSources: settingsSourcesReducer,
    }),
    middleware: (getDefault) => getDefault({ serializableCheck: false }),
  })
}

function wrapperFor(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
  Wrapper.displayName = 'TestStoreWrapper'
  return Wrapper
}

/**
 * Each of these hooks reaches a different third party, and each has its own
 * switch in Settings. All three default to off, so someone who has connected
 * nothing but their own server sends nothing to any of them.
 */
describe('external metadata gating', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('does not ask MusicBrainz for an mbid until MusicBrainz is enabled', async () => {
    const store = makeStore()

    const { result } = await renderHook(
      () => useArtistMbid('Boards of Canada', null),
      { wrapper: wrapperFor(store) }
    )
    expect(searchArtist).not.toHaveBeenCalled()
    expect(result.current.mbid).toBeNull()
    // And nothing to show for it: a shelf that needs the id hides itself
    // rather than sitting on a spinner that will never resolve.
    expect(result.current.isResolving).toBe(false)

    await act(async () => { store.dispatch(setSourceUse({ use: 'musicbrainz.search', enabled: true })) })
    await renderHook(
      () => useArtistMbid('Boards of Canada', null),
      { wrapper: wrapperFor(store) }
    )

    expect(searchArtist).toHaveBeenCalledWith('Boards of Canada', 1)
  })

  it('asks a busy MusicBrainz again, but takes any other failure as final', async () => {
    mockQueryOptions = []
    await renderHook(
      () => useArtistMbid('Boards of Canada', null, { allowLookup: true }),
      { wrapper: wrapperFor(makeStore()) }
    )
    const retry = mockQueryOptions[mockQueryOptions.length - 1].retry as (failures: number, error: Error) => boolean

    // Faster than one request a second is a 503: "again shortly", not "no match".
    expect(retry(0, new Error('MusicBrainz 503: /artist'))).toBe(true)
    expect(retry(1, new Error('MusicBrainz 503: /artist'))).toBe(true)
    expect(retry(2, new Error('MusicBrainz 503: /artist'))).toBe(false)
    expect(retry(0, new Error('MusicBrainz 400: /artist'))).toBe(false)
  })

  it('looks the id up with MusicBrainz off when the calling feature allows the lookup itself', async () => {
    const store = makeStore()

    await renderHook(
      () => useArtistMbid('Boards of Canada', null, { allowLookup: true }),
      { wrapper: wrapperFor(store) }
    )

    expect(searchArtist).toHaveBeenCalledWith('Boards of Canada', 1)
  })

  it('does not look up even an allowed id while the feature itself is off', async () => {
    const store = makeStore()

    const { result } = await renderHook(
      () => useArtistMbid('Boards of Canada', null, { allowLookup: true, enabled: false }),
      { wrapper: wrapperFor(store) }
    )

    expect(searchArtist).not.toHaveBeenCalled()
    expect(result.current.isResolving).toBe(false)
  })

  it('still uses an mbid the server already carries with MusicBrainz off', async () => {
    const store = makeStore()

    const { result } = await renderHook(
      () => useArtistMbid('Boards of Canada', 'mbid-local'),
      { wrapper: wrapperFor(store) }
    )

    expect(result.current.mbid).toBe('mbid-local')
    expect(searchArtist).not.toHaveBeenCalled()
  })

  it('does not call ListenBrainz until discovery is enabled', async () => {
    const store = makeStore()

    await renderHook(
      () => useLBSimilarArtists({ mbid: 'mbid-1', excludeName: 'Boards of Canada' }, 8),
      { wrapper: wrapperFor(store) }
    )
    expect(getLBSimilarArtists).not.toHaveBeenCalled()

    await act(async () => { store.dispatch(setSourceUse({ use: 'listenbrainz.similarArtists', enabled: true })) })
    await renderHook(
      () => useLBSimilarArtists({ mbid: 'mbid-1', excludeName: 'Boards of Canada' }, 8),
      { wrapper: wrapperFor(store) }
    )

    expect(getLBSimilarArtists).toHaveBeenCalledWith('mbid-1', 8)
  })

  it('does not call Last.fm until Last.fm is enabled', async () => {
    const store = makeStore()

    await renderHook(
      () => useSimilarArtists({ name: 'Boards of Canada', limit: 8 }),
      { wrapper: wrapperFor(store) }
    )
    expect(getLastFmSimilarArtists).not.toHaveBeenCalled()

    await act(async () => { store.dispatch(setSourceUse({ use: 'lastfm.similarArtists', enabled: true })) })
    await renderHook(
      () => useSimilarArtists({ name: 'Boards of Canada', limit: 8 }),
      { wrapper: wrapperFor(store) }
    )

    expect(getLastFmSimilarArtists).toHaveBeenCalled()
  })

  it('looks up pictures for similar artists only once artist artwork is enabled', async () => {
    const store = makeStore()
    const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    await act(async () => { store.dispatch(setSourceUse({ use: 'listenbrainz.similarArtists', enabled: true })) })
    await act(async () => { store.dispatch(setSourceUse({ use: 'lastfm.similarArtists', enabled: true })) })

    await renderHook(() => useLBSimilarArtists({ mbid: 'mbid-1' }, 8), { wrapper: wrapperFor(store) })
    await renderHook(() => useSimilarArtists({ name: 'Boards of Canada', limit: 8 }), { wrapper: wrapperFor(store) })
    await settle()
    // The lists were fetched, but no names went out for their pictures.
    expect(getLBSimilarArtists).toHaveBeenCalled()
    expect(resolveDeezerArtistByName).not.toHaveBeenCalled()

    await act(async () => { store.dispatch(setSourceUse({ use: 'deezer.artwork', enabled: true })) })
    await renderHook(() => useLBSimilarArtists({ mbid: 'mbid-1' }, 8), { wrapper: wrapperFor(store) })
    await renderHook(() => useSimilarArtists({ name: 'Boards of Canada', limit: 8 }), { wrapper: wrapperFor(store) })
    await settle()

    expect(resolveDeezerArtistByName).toHaveBeenCalledWith('Bibio')
  })
})
