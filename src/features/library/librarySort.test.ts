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
      libraryState: 'in-library',
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
