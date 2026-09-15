import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import statsReducer, { incrementPlay } from '@/state/redux/slices/statsSlice'
import type { RootState } from '@/state/redux/store'

import { selectPlaylistLastPlayedAt, selectPlaylistPlayCounts } from './statsSelectors'

const SERVER = 'server-1'
// What the queue used to record a playlist play under.
const oldKey = makeLocalId('playlist', serverProvenance(SERVER), 'pl-1')

function rootWith(plays: { playlistId: string; at: number }[]): RootState {
  let stats = statsReducer(undefined, { type: '@@INIT' })
  for (const { playlistId, at } of plays) {
    jest.spyOn(Date, 'now').mockReturnValue(at)
    stats = statsReducer(stats, incrementPlay({ serverId: SERVER, songId: 's1', playlistId }))
  }
  jest.restoreAllMocks()
  return { stats, servers: { activeServerId: SERVER } } as unknown as RootState
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
