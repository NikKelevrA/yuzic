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

/**
 * The title order folds names instead of collating them.
 *
 * `Intl.Collator.compare` inside the comparator was 3.4 seconds of blocked JS
 * thread to open a 89,878 track list on a device — about 1.5 million calls at
 * roughly two microseconds each. Folding each name once and comparing the
 * folded strings does the same list in 514 ms, and gives up ICU's
 * locale-specific rules to do it.
 *
 * This is what says the trade was safe: the names below are picked to be the
 * ones a fold gets wrong if it is naive — accents that decompose, letters that
 * do not, punctuation, digits, mixed case, a leading article. Both orders are
 * built here and compared, so a change to the fold that moves any of them
 * fails rather than quietly reordering somebody's library.
 */
describe('sorting by title', () => {
  const AWKWARD = [
    'Abba', 'ábba', 'ÄBBA', 'Air', 'Ångström', 'Beatles', 'Björk', 'Blur',
    'Café Tacvba', 'Cafe Tacvba', 'Daft Punk', 'Dvořák', 'Éliane Radigue',
    'Elbow', 'Faust', 'Fauré', 'Grimes', 'Håkan', 'Haken', 'Iggy Pop',
    'Jóhann Jóhannsson', 'Kraftwerk', 'Låpsley', 'Lapsley', 'Mø', 'Moby',
    'Neu!', 'Nils Frahm', 'Ólafur Arnalds', 'Sigur Rós', 'Stereolab', 'Toto',
    'Völur', 'Xiu Xiu', 'Zappa', 'The xx', '!!!', '2Pac', '10cc', 'Æther',
    'Øresund', 'Straße',
  ]

  const named = (title: string): LibraryItem => ({
    kind: 'playlist',
    data: {
      localId: makeLocalId('playlist', provenance, title),
      nativeId: title,
      provenance,
      externalIds: {},
      title,
      cover: { kind: 'none' },
      isOwned: true,
      songIds: [],
    } as Playlist,
  })

  it('orders the awkward names the way a base-sensitivity collator does', () => {
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

    const folded = sortItems(AWKWARD.map(named), 'title', EMPTY_SORT_STATS)
      .map(item => (item.kind === 'playlist' ? item.data.title : ''))
    const collated = [...AWKWARD].sort((a, b) => collator.compare(a, b))

    expect(folded).toEqual(collated)
  })

  it('ties names that differ only by case or accent, and keeps catalog order for them', () => {
    // What base sensitivity meant, and what the fold has to keep meaning.
    const sorted = sortItems([named('ÄBBA'), named('abba'), named('Ábba')], 'title', EMPTY_SORT_STATS)

    expect(sorted.map(item => (item.kind === 'playlist' ? item.data.title : '')))
      .toEqual(['ÄBBA', 'abba', 'Ábba'])
  })
})
