import libraryStarredReducer, {
  addLibraryStarredSong,
  clearLibraryStarred,
  removeLibraryStarredSong,
  setLibraryStarredAlbums,
} from './libraryStarredSlice'
import type { Album } from '@/domain/entities/Album'
import type { Song } from '@/domain/entities/Song'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'

const provenance = serverProvenance('srv-1')

const song: Song = {
  localId: makeLocalId('song', provenance, 'song-1'),
  nativeId: 'song-1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: 'Song',
  artist: {
    localId: makeLocalId('artist', provenance, 'artist-1'),
    nativeId: 'artist-1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  album: {
    localId: makeLocalId('album', provenance, 'album-1'),
    nativeId: 'album-1',
    externalIds: {},
    title: 'Album',
    cover: { kind: 'none' },
  },
  cover: { kind: 'none' },
  durationSeconds: 120,
  contentKind: 'song',
  genres: [],
}

const album: Album = {
  localId: makeLocalId('album', provenance, 'album-1'),
  nativeId: 'album-1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: 'Album',
  cover: { kind: 'none' },
  artist: {
    localId: makeLocalId('artist', provenance, 'artist-1'),
    nativeId: 'artist-1',
    externalIds: {},
    name: 'Artist',
    cover: { kind: 'none' },
  },
  year: 2020,
  releaseType: 'album',
  genres: [],
  songIds: [],
}

describe('libraryStarred offline reducers', () => {
  it('optimistically adds and removes starred songs', () => {
    const added = libraryStarredReducer(undefined, addLibraryStarredSong(song))
    expect(added.starred.map(item => item.nativeId)).toEqual([song.nativeId])

    const removed = libraryStarredReducer(added, removeLibraryStarredSong(song.nativeId))
    expect(removed.starred).toEqual([])
  })

  it('sets starred albums and clears them on clearLibraryStarred', () => {
    const withAlbums = libraryStarredReducer(undefined, setLibraryStarredAlbums([album]))
    expect(withAlbums.starredAlbums.map(item => item.nativeId)).toEqual([album.nativeId])

    const cleared = libraryStarredReducer(withAlbums, clearLibraryStarred())
    expect(cleared.starredAlbums).toEqual([])
  })
})
