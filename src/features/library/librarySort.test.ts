import type { Playlist } from '@/domain/entities/Playlist'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'

import { EMPTY_SORT_STATS, sortItems, type LibraryItem } from './librarySort'

const provenance = serverProvenance('srv-1')

function playlist(nativeId: string, updatedAt = 0): LibraryItem {
  return {
    kind: 'playlist',
    data: {
      localId: makeLocalId('playlist', provenance, nativeId),
      nativeId,
      provenance,
      externalIds: {},
      title: nativeId,
      cover: { kind: 'none' },
      isOwned: true,
      updatedAt,
      songIds: [],
    } as Playlist,
  }
}

const ids = (items: LibraryItem[]) => items.map(item => (item.kind === 'playlist' ? item.data.nativeId : ''))

describe('sorting playlists by play history', () => {
  it('orders playlists by when they were last played, not last edited', () => {
    // Home's Recently Played shelf opens this order, so it has to agree with
    // the shelf rather than with the last rename.
    const sorted = sortItems(
      [playlist('edited-lately', 900), playlist('played-lately', 1)],
      'recent',
      { ...EMPTY_SORT_STATS, playlistLastPlayed: { 'played-lately': 500 } },
    )

    expect(ids(sorted)).toEqual(['played-lately', 'edited-lately'])
  })

  it('orders playlists by how often they were played', () => {
    const sorted = sortItems(
      [playlist('rare'), playlist('often')],
      'userplays',
      { ...EMPTY_SORT_STATS, playlistPlays: { rare: 1, often: 7 } },
    )

    expect(ids(sorted)).toEqual(['often', 'rare'])
  })

  it('reads stats by the playlist’s own id, which is how plays are recorded', () => {
    const played = playlist('b')
    const sorted = sortItems(
      [playlist('a'), played],
      'recent',
      { ...EMPTY_SORT_STATS, playlistLastPlayed: { [makeLocalId('playlist', provenance, 'b')]: 500 } },
    )

    expect(ids(sorted)).toEqual(['a', 'b'])
  })
})

const track = (nativeId: string, userRating?: number): LibraryItem => ({
  kind: 'track',
  data: {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    title: nativeId,
    artist: { name: '' },
    album: { title: '', cover: { kind: 'none' } },
    cover: { kind: 'none' },
    durationSeconds: 0,
    contentKind: 'song',
    genres: [],
    userRating,
  } as unknown as LibraryItem['data'],
}) as LibraryItem

const trackIds = (items: LibraryItem[]) =>
  items.map(item => (item.kind === 'track' ? item.data.nativeId : ''))

describe('sorting by rating', () => {
  it('puts the best first and the unrated last', () => {
    const sorted = sortItems(
      [track('unrated'), track('two', 2), track('five', 5)],
      'rating',
      EMPTY_SORT_STATS,
    )
    expect(trackIds(sorted)).toEqual(['five', 'two', 'unrated'])
  })

  it('prefers what this device just wrote over what the catalog still says', () => {
    const sorted = sortItems(
      [track('demoted', 5), track('promoted', 1)],
      'rating',
      EMPTY_SORT_STATS,
      { demoted: 1, promoted: 5 },
    )
    expect(trackIds(sorted)).toEqual(['promoted', 'demoted'])
  })

  it('sorts a cleared rating down, rather than back to what the catalog said', () => {
    const sorted = sortItems([track('cleared', 5), track('kept', 3)], 'rating', EMPTY_SORT_STATS, {
      cleared: 0,
    })
    expect(trackIds(sorted)).toEqual(['kept', 'cleared'])
  })

  it('breaks the ties by name, because at five values the ties are the list', () => {
    const sorted = sortItems(
      [track('c', 4), track('a', 4), track('b', 4)],
      'rating',
      EMPTY_SORT_STATS,
    )
    expect(trackIds(sorted)).toEqual(['a', 'b', 'c'])
  })

  it('leaves a kind that cannot be rated where a stable order puts it', () => {
    const sorted = sortItems([playlist('zz'), track('rated', 3), playlist('aa')], 'rating', EMPTY_SORT_STATS)
    expect(sorted[0].kind).toBe('track')
  })
})
