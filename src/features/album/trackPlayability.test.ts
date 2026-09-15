import { classifyTrackPlayability, playableSongs, resolveTrackPlayability } from './trackPlayability'
import type { Song } from '@/domain/entities/Song'
import type { LocalId } from '@/domain/identity/LocalId'

const artistRef = { localId: 'local:artist:srv:s1:a1' as LocalId, nativeId: 'a1', name: 'Artist', cover: { kind: 'none' as const }, externalIds: {} }
const albumRef = { localId: 'local:album:srv:s1:al1' as LocalId, nativeId: 'al1', title: 'Album', cover: { kind: 'none' as const }, externalIds: {} }

function song(id: string, overrides: Partial<Song> = {}): Song {
  return {
    localId: `local:song:srv:s1:${id}` as LocalId,
    nativeId: id,
    provenance: { origin: 'server', serverId: 's1' },
    externalIds: {},
    libraryState: 'in-library',
    title: `Song ${id}`,
    artist: artistRef,
    album: albumRef,
    cover: { kind: 'none' },
    durationSeconds: 180,
    contentKind: 'song',
    genres: [],
    ...overrides,
  }
}

describe('resolveTrackPlayability', () => {
  it('is always full for a local library album, regardless of preview data', () => {
    const s = song('1')
    expect(resolveTrackPlayability(s, true, {})).toEqual({ kind: 'full' })
    expect(resolveTrackPlayability(s, true, { '1': 'https://preview' })).toEqual({ kind: 'full' })
  })

  it('is preview for an external track whose clip resolved', () => {
    const s = song('1')
    expect(resolveTrackPlayability(s, false, { '1': 'https://preview.mp3' }))
      .toEqual({ kind: 'preview', streamId: 'https://preview.mp3' })
  })

  it('is unavailable for an external track with no resolved clip', () => {
    const s = song('1')
    expect(resolveTrackPlayability(s, false, {})).toEqual({ kind: 'unavailable' })
  })
})

describe('classifyTrackPlayability', () => {
  it('classifies every song by its own local id', () => {
    const songs = [song('1'), song('2')]
    const result = classifyTrackPlayability(songs, false, { '1': 'https://p1' })

    expect(result.get(songs[0].localId)).toEqual({ kind: 'preview', streamId: 'https://p1' })
    expect(result.get(songs[1].localId)).toEqual({ kind: 'unavailable' })
  })
})

describe('playableSongs', () => {
  it('keeps full tracks unchanged', () => {
    const songs = [song('1')]
    const playability = classifyTrackPlayability(songs, true, {})
    expect(playableSongs(songs, playability)).toEqual(songs)
  })

  it('attaches the clip url as streamId for preview tracks', () => {
    const songs = [song('1')]
    const playability = classifyTrackPlayability(songs, false, { '1': 'https://p1' })
    const result = playableSongs(songs, playability)
    expect(result).toHaveLength(1)
    expect(result[0].streamId).toBe('https://p1')
  })

  it('drops unavailable tracks entirely', () => {
    const songs = [song('1'), song('2')]
    const playability = classifyTrackPlayability(songs, false, { '2': 'https://p2' })
    const result = playableSongs(songs, playability)
    expect(result.map(s => s.nativeId)).toEqual(['2'])
  })
})
