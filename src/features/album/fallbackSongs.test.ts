import { buildFallbackAlbumSongs } from './fallbackSongs'
import type { Song } from '@/domain/entities/Song'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'

const provenance = serverProvenance('srv-1')

const track = (
  nativeId: string,
  albumNativeId: string,
  overrides: Partial<Song> = {}
): Song => ({
  localId: makeLocalId('song', provenance, nativeId),
  nativeId,
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: `Track ${nativeId}`,
  artist: {
    localId: makeLocalId('artist', provenance, 'artist-1'),
    nativeId: 'artist-1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  album: {
    localId: makeLocalId('album', provenance, albumNativeId),
    nativeId: albumNativeId,
    externalIds: {},
    title: 'Album',
    cover: { kind: 'none' },
  },
  cover: { kind: 'none' },
  durationSeconds: 200,
  contentKind: 'song',
  genres: [],
  ...overrides,
})

describe('buildFallbackAlbumSongs', () => {
  it('returns only the tracks belonging to the album', () => {
    const tracks = [
      track('a', 'album-1'),
      track('b', 'album-2'),
      track('c', 'album-1'),
    ]

    expect(buildFallbackAlbumSongs(tracks, 'album-1').map(s => s.nativeId)).toEqual(['a', 'c'])
  })

  it('orders by disc then track number', () => {
    const tracks = [
      track('d2t1', 'album-1', { discNumber: 2, trackNumber: 1 }),
      track('d1t2', 'album-1', { discNumber: 1, trackNumber: 2 }),
      track('d1t1', 'album-1', { discNumber: 1, trackNumber: 1 }),
    ]

    expect(buildFallbackAlbumSongs(tracks, 'album-1').map(s => s.nativeId))
      .toEqual(['d1t1', 'd1t2', 'd2t1'])
  })

  it('sinks tracks without a track number and treats missing disc as disc 1', () => {
    const tracks = [
      track('unnumbered', 'album-1'),
      track('t1', 'album-1', { trackNumber: 1 }),
    ]

    expect(buildFallbackAlbumSongs(tracks, 'album-1').map(s => s.nativeId))
      .toEqual(['t1', 'unnumbered'])
  })

  it('returns empty for a missing album id', () => {
    expect(buildFallbackAlbumSongs([track('a', 'album-1')], '')).toEqual([])
  })
})
