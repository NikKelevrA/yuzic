import { onePerAlbum } from './randomDraw'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'

const PROVENANCE = serverProvenance('server-1')

const song = (id: string, albumId: string): Song => ({
  localId: makeLocalId('song', PROVENANCE, id),
  nativeId: id,
  provenance: PROVENANCE,
  externalIds: {},
  title: `Track ${id}`,
  artist: {
    localId: makeLocalId('artist', PROVENANCE, 'artist-1'),
    nativeId: 'artist-1',
    externalIds: {},
    name: 'Someone',
    cover: { kind: 'none' },
  },
  album: {
    localId: makeLocalId('album', PROVENANCE, albumId),
    nativeId: albumId,
    externalIds: {},
    title: '',
    cover: { kind: 'none' },
  },
  cover: { kind: 'none' },
  durationSeconds: 180,
  contentKind: 'song',
  genres: [],
})

describe('onePerAlbum', () => {
  it('keeps a draw that is already varied intact', () => {
    const draw = [song('1', 'a'), song('2', 'b'), song('3', 'c')]

    expect(onePerAlbum(draw).map(s => s.nativeId)).toEqual(['1', '2', '3'])
  })

  it('thins a draw that came back as one album, which is what shipped', () => {
    // A genre-filtered random draw over a narrow pool returns that pool's
    // tracklist, so the shelf drew the same cover three times in a row.
    const draw = [song('1', 'a'), song('2', 'a'), song('3', 'a'), song('4', 'b')]

    expect(onePerAlbum(draw).map(s => s.nativeId)).toEqual(['1', '4'])
  })

  it('keeps the first of each album, so the draw order still decides', () => {
    const draw = [song('1', 'a'), song('2', 'b'), song('3', 'a')]

    expect(onePerAlbum(draw).map(s => s.nativeId)).toEqual(['1', '2'])
  })

  it('lets songs with no album id each stand alone', () => {
    // They cannot be grouped, and dropping them all but one would thin a
    // library of loose tracks down to nothing.
    const draw = [song('1', ''), song('2', ''), song('3', 'a')]

    expect(onePerAlbum(draw).map(s => s.nativeId)).toEqual(['1', '2', '3'])
  })

  it('handles an empty draw', () => {
    expect(onePerAlbum([])).toEqual([])
  })
})
