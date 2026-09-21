import { findArtistsWithSharedGenres } from './localSimilarArtists'
import type { Album } from '@/domain/entities/Album'
import type { LocalId } from '@/domain/identity/LocalId'

const asLocalId = (id: string) => `local:artist:srv:server1:${id}` as LocalId

const artistRef = (id: string, name: string) => ({
  localId: asLocalId(id),
  nativeId: id,
  name,
  cover: { kind: 'none' as const },
  externalIds: {},
})

const album = (id: string, artistId: string, artistName: string, genres: string[]): Album => ({
  localId: `local:album:srv:server1:${id}` as LocalId,
  nativeId: id,
  provenance: { origin: 'server', serverId: 'server1' },
  externalIds: {},
  title: `Album ${id}`,
  cover: { kind: 'none' },
  artist: artistRef(artistId, artistName),
  year: 2000,
  releaseType: 'album',
  genres,
  songIds: [],
})

describe('findArtistsWithSharedGenres', () => {
  it('ranks other artists by number of overlapping genres', () => {
    const albums = [
      album('1', 'target', 'Target Artist', ['rock', 'indie']),
      album('2', 'a', 'Artist A', ['rock', 'indie']),
      album('3', 'b', 'Artist B', ['rock']),
      album('4', 'c', 'Artist C', ['jazz']),
    ]

    const result = findArtistsWithSharedGenres(asLocalId('target'), albums)
    expect(result.map(a => a.nativeId)).toEqual(['a', 'b'])
  })

  it('excludes the target artist itself', () => {
    const albums = [
      album('1', 'target', 'Target Artist', ['rock']),
      album('2', 'target', 'Target Artist', ['rock']),
    ]

    expect(findArtistsWithSharedGenres(asLocalId('target'), albums)).toEqual([])
  })

  it('returns nothing when the target artist has no genre data', () => {
    const albums = [
      album('1', 'target', 'Target Artist', []),
      album('2', 'a', 'Artist A', ['rock']),
    ]

    expect(findArtistsWithSharedGenres(asLocalId('target'), albums)).toEqual([])
  })

  it('respects the limit', () => {
    const albums = [
      album('t', 'target', 'Target Artist', ['rock']),
      ...Array.from({ length: 10 }, (_, i) => album(`${i}`, `artist-${i}`, `Artist ${i}`, ['rock'])),
    ]

    expect(findArtistsWithSharedGenres(asLocalId('target'), albums, 3)).toHaveLength(3)
  })
})
