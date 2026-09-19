import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import listeningReducer, { recordListen } from '@/state/redux/slices/listeningSlice'
import statsReducer, { setServerSongStats } from '@/state/redux/slices/statsSlice'
import type { RootState } from '@/state/redux/store'

import {
  selectPlaylistLastPlayedAt,
  selectPlaylistPlayCounts,
  selectSongPlayCounts,
} from './statsSelectors'

const SERVER = 'server-1'
// What the queue used to record a playlist play under.
const oldKey = makeLocalId('playlist', serverProvenance(SERVER), 'pl-1')

type Listen = { track?: string; playlistId?: string; at: number; seconds?: number }

function rootWith(listens: Listen[], serverStats: { id: string; playCount: number }[] = []): RootState {
  let listening = listeningReducer(undefined, { type: '@@INIT' })
  for (const { track = 's1', playlistId, at, seconds = 200 } of listens) {
    listening = listeningReducer(listening, recordListen({
      at,
      track: `${SERVER}:${track}`,
      playlist: playlistId ? `${SERVER}:${playlistId}` : undefined,
      seconds,
      duration: 240,
      ending: 'finished',
    }))
  }

  let stats = statsReducer(undefined, { type: '@@INIT' })
  if (serverStats.length) {
    stats = statsReducer(stats, setServerSongStats({ serverId: SERVER, stats: serverStats }))
  }

  return { stats, listening, servers: { activeServerId: SERVER } } as unknown as RootState
}

describe('playlist play stats', () => {
  it('finds plays recorded under a playlist’s local id by its own id', () => {
    // Without this, every playlist played since the id mismatch stays off
    // Recently Played until it is played again.
    const state = rootWith([{ playlistId: oldKey, at: 100 }])

    expect(selectPlaylistLastPlayedAt(state)).toEqual({ 'pl-1': 100 })
    expect(selectPlaylistPlayCounts(state)).toEqual({ 'pl-1': 1 })
  })

  it('merges old and new plays of the same playlist', () => {
    const state = rootWith([
      { playlistId: oldKey, at: 300 },
      { playlistId: 'pl-1', at: 200 },
    ])

    expect(selectPlaylistLastPlayedAt(state)).toEqual({ 'pl-1': 300 })
    expect(selectPlaylistPlayCounts(state)).toEqual({ 'pl-1': 2 })
  })
})

/**
 * The merge between what this device saw and what the server says.
 *
 * It used to be a sum, which was only safe because the local tally was deleted
 * per entity the moment the server's own count arrived including it. The log
 * that replaced that tally is the listener's history and is never deleted, so
 * a sum would double-count every listen both sides know about, for good.
 */
describe('reconciling local listening with the server', () => {
  it('takes the server count when it is higher, rather than adding to it', () => {
    // The server has counted this device's three listens, and others besides.
    const state = rootWith(
      [{ at: 100 }, { at: 200 }, { at: 300 }],
      [{ id: 's1', playCount: 40 }],
    )
    expect(selectSongPlayCounts(state)['s1']).toBe(40)
  })

  /**
   * Scrobbling switched off, the server unreachable, or a listen it declined
   * to record. The local number is all there is and must show through.
   */
  it('shows the local count where the server has none', () => {
    const state = rootWith([{ at: 100 }, { at: 200 }])
    expect(selectSongPlayCounts(state)['s1']).toBe(2)
  })

  it('takes the local count when it has run ahead of the server', () => {
    const state = rootWith(
      [{ at: 100 }, { at: 200 }, { at: 300 }],
      [{ id: 's1', playCount: 1 }],
    )
    expect(selectSongPlayCounts(state)['s1']).toBe(3)
  })

  /**
   * A skip is recorded in the log — that is the point of it — but it is not a
   * play, and a count shown to a listener must agree with the one their server
   * and Last.fm show for the same listening.
   */
  it('does not count a skipped listen as a play', () => {
    const state = rootWith([{ at: 100, seconds: 20 }])
    expect(selectSongPlayCounts(state)['s1']).toBeUndefined()
  })

  it('keeps one server’s listening out of another’s', () => {
    const state = rootWith([{ at: 100 }])
    const other = { ...state, servers: { activeServerId: 'other' } } as unknown as RootState
    expect(selectSongPlayCounts(other)).toEqual({})
  })
})
