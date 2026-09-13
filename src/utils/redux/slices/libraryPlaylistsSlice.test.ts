import libraryPlaylistsReducer, {
  addLibraryPlaylistSong,
  removeLibraryPlaylistSong,
  setLibraryPlaylists,
} from './libraryPlaylistsSlice'
import type { Playlist } from '@/domain/entities/Playlist'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'

const provenance = serverProvenance('srv-1')

const playlist: Playlist = {
  localId: makeLocalId('playlist', provenance, 'playlist-1'),
  nativeId: 'playlist-1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: 'Playlist',
  cover: { kind: 'none' },
  isOwned: true,
  createdAt: 0,
  updatedAt: 0,
  songIds: [],
}

describe('library offline reducers', () => {
  it('optimistically bumps updatedAt on add and remove', () => {
    const initial = libraryPlaylistsReducer(undefined, setLibraryPlaylists([playlist]))

    const added = libraryPlaylistsReducer(
      initial,
      addLibraryPlaylistSong({ playlistId: playlist.nativeId, song: {} })
    )
    expect(added.playlists[0].updatedAt).toBeGreaterThan(0)

    const removed = libraryPlaylistsReducer(
      added,
      removeLibraryPlaylistSong({ playlistId: playlist.nativeId, songId: 'song-1' })
    )
    expect(removed.playlists[0].updatedAt).toBeGreaterThan(0)
  })
})
