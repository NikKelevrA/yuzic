import { playlistArtistNames, pickFallbackLocalSongs } from './recommendedSongs'
import type { Song } from '@/domain/entities/Song'
import type { LocalId } from '@/domain/identity/LocalId'

const albumRef = { localId: 'local:album:srv:s1:al1' as LocalId, nativeId: 'al1', title: 'Album', cover: { kind: 'none' as const }, externalIds: {} }

function artistRef(name: string) {
  return { localId: `local:artist:srv:s1:${name}` as LocalId, nativeId: name, name, cover: { kind: 'none' as const }, externalIds: {} }
}

function song(id: string, artistName: string, overrides: Partial<Song> = {}): Song {
  return {
    localId: `local:song:srv:s1:${id}` as LocalId,
    nativeId: id,
    provenance: { origin: 'server', serverId: 's1' },
    externalIds: {},
    title: `Song ${id}`,
    artist: artistRef(artistName),
    album: albumRef,
    cover: { kind: 'none' },
    durationSeconds: 180,
    contentKind: 'song',
    genres: [],
    ...overrides,
  }
}

describe('playlistArtistNames', () => {
  it('collects distinct artist names, capped at max', () => {
    const songs = [song('1', 'A'), song('2', 'B'), song('3', 'A'), song('4', 'C'), song('5', 'D')]
    expect(playlistArtistNames(songs, 3)).toEqual(['A', 'B', 'C'])
  })

  it('excludes "Various Artists" regardless of case', () => {
    const songs = [song('1', 'Various Artists'), song('2', 'various artists'), song('3', 'Real Artist')]
    expect(playlistArtistNames(songs)).toEqual(['Real Artist'])
  })

  it('returns an empty array for an empty playlist', () => {
    expect(playlistArtistNames([])).toEqual([])
  })
})

describe('pickFallbackLocalSongs', () => {
  it('picks only tracks by a seed artist that are not already in the playlist', () => {
    const inPlaylist = song('1', 'A')
    const sameArtist = song('2', 'A')
    const otherArtist = song('3', 'B')
    const tracks = [inPlaylist, sameArtist, otherArtist]

    const result = pickFallbackLocalSongs(
      tracks,
      new Set([inPlaylist.localId]),
      ['A'],
      1,
      8
    )

    expect(result.map(s => s.localId)).toEqual([sameArtist.localId])
  })

  it('caps the result at count', () => {
    const tracks = Array.from({ length: 20 }, (_, i) => song(`${i}`, 'A'))
    const result = pickFallbackLocalSongs(tracks, new Set(), ['A'], 42, 5)
    expect(result).toHaveLength(5)
  })

  it('is deterministic for a given seed', () => {
    const tracks = Array.from({ length: 10 }, (_, i) => song(`${i}`, 'A'))
    const a = pickFallbackLocalSongs(tracks, new Set(), ['A'], 7, 5)
    const b = pickFallbackLocalSongs(tracks, new Set(), ['A'], 7, 5)
    expect(a.map(s => s.localId)).toEqual(b.map(s => s.localId))
  })
})
