import type { Song } from '@/domain/entities/Song'
import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import reducer, {
  enqueueOfflineMutationAction,
  markOfflineMutationFailed,
  retryOfflineMutationsForServer,
  clearOfflineMutationsForServer,
} from './offlineMutationsSlice'
import { OfflineMutation } from '@/utils/offline/offlineMutations'

const provenance = serverProvenance('server-1')

/** A domain song, as a mapper would build it. */
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

const mutation: OfflineMutation = {
  id: 'mutation-1',
  serverId: 'server-1',
  type: 'starSong',
  song,
  createdAt: 1,
}

describe('offlineMutationsSlice', () => {
  it('marks failed mutations with retry metadata', () => {
    const queued = reducer(undefined, enqueueOfflineMutationAction(mutation))

    const failed = reducer(queued, markOfflineMutationFailed({
      id: mutation.id,
      error: 'Network request failed',
      failedAt: 100,
      nextRetryAt: 200,
    }))

    expect(failed.queue[0]).toMatchObject({
      retryCount: 1,
      lastError: 'Network request failed',
      lastFailedAt: 100,
      nextRetryAt: 200,
    })
  })

  it('clears failure metadata when retrying a server', () => {
    const failed = {
      queue: [{
        ...mutation,
        retryCount: 2,
        lastError: 'Still offline',
        lastFailedAt: 100,
        nextRetryAt: 200,
      }],
    }

    const retried = reducer(failed, retryOfflineMutationsForServer('server-1'))

    expect(retried.queue[0]).toEqual({
      ...mutation,
      retryCount: 2,
    })
  })

  it('clears queued mutations for a server', () => {
    const otherServerMutation: OfflineMutation = {
      ...mutation,
      id: 'mutation-2',
      serverId: 'server-2',
    }
    const state = { queue: [mutation, otherServerMutation] }

    expect(reducer(state, clearOfflineMutationsForServer('server-1')).queue)
      .toEqual([otherServerMutation])
  })
})
