import { classifyDiscography } from './classifyDiscography'
import type { Album } from '@/domain/entities/Album'
import type { LocalId } from '@/domain/identity/LocalId'

const artistRef = {
  localId: 'local:artist:srv:server1:a1' as LocalId,
  nativeId: 'a1',
  name: 'Artist',
  cover: { kind: 'none' as const },
  externalIds: {},
}

const local = (id: string, year: number, title = `Album ${id}`): Album => ({
  localId: `local:album:srv:server1:${id}` as LocalId,
  nativeId: id,
  provenance: { origin: 'server', serverId: 'server1' },
  externalIds: {},
  title,
  cover: { kind: 'none' },
  artist: artistRef,
  year,
  releaseType: 'album',
  genres: [],
  songIds: [],
})

const external = (id: string, year: number, title = `Ext ${id}`): Album => ({
  localId: `local:album:ext:deezer:${id}` as LocalId,
  nativeId: id,
  provenance: { origin: 'integration', providerId: 'deezer' },
  externalIds: {},
  title,
  cover: { kind: 'none' },
  artist: artistRef,
  year,
  releaseType: 'album',
  genres: [],
  songIds: [],
})

describe('classifyDiscography', () => {
  it('splits owned albums from owned singles by track count', () => {
    const album = local('1', 2020)
    const single = local('2', 2021, 'Single 2')
    const counts = new Map([[album.localId, 10], [single.localId, 2]])

    const result = classifyDiscography([album, single], counts, null)

    expect(result.ownedAlbums.map(a => a.localId)).toEqual([album.localId])
    expect(result.ownedSingles.map(a => a.localId)).toEqual([single.localId])
  })

  it('sorts each bucket newest release first', () => {
    const older = local('1', 2010)
    const newer = local('2', 2020)
    const counts = new Map([[older.localId, 10], [newer.localId, 10]])

    const result = classifyDiscography([newer, older], counts, null)

    expect(result.ownedAlbums.map(a => a.localId)).toEqual([newer.localId, older.localId])
  })

  it('keeps an external release matched to an owned album out of unowned', () => {
    const owned = local('1', 2020, 'Same Title')
    const counts = new Map([[owned.localId, 10]])
    const matching = external('ext-1', 2020, 'Same Title')

    const result = classifyDiscography([owned], counts, { albums: [matching], singles: [] })

    expect(result.unownedAlbums).toHaveLength(0)
  })

  it('surfaces an external release with no local match as unowned', () => {
    const owned = local('1', 2020, 'Owned Title')
    const counts = new Map([[owned.localId, 10]])
    const missing = external('ext-1', 2019, 'Missing Title')

    const result = classifyDiscography([owned], counts, { albums: [missing], singles: [] })

    expect(result.unownedAlbums.map(a => a.localId)).toEqual([missing.localId])
  })

  it('returns empty unowned buckets when there is no external discography', () => {
    const result = classifyDiscography([], new Map(), null)

    expect(result.unownedAlbums).toEqual([])
    expect(result.unownedSingles).toEqual([])
  })
})
