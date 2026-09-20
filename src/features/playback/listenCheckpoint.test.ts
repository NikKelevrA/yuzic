import { makeLocalId } from '@/domain/identity/LocalId'
import { serverProvenance } from '@/domain/identity/Provenance'
import type { Song } from '@/domain/entities/Song'
import {
  clearListenCheckpoint,
  clearListenCheckpointFor,
  readListenCheckpoint,
  saveListenCheckpoint,
} from './listenCheckpoint'

const provenance = serverProvenance('srv-1')

const song: Song = {
  localId: makeLocalId('song', provenance, 's1'),
  nativeId: 's1',
  provenance,
  externalIds: {},
  libraryState: 'in-library',
  title: 'Roygbiv',
  artist: { localId: makeLocalId('artist', provenance, 'a1'), nativeId: 'a1', externalIds: {}, name: 'Boards of Canada', cover: { kind: 'none' } },
  album: { localId: makeLocalId('album', provenance, 'al1'), nativeId: 'al1', externalIds: {}, title: 'Album', cover: { kind: 'none' } },
  cover: { kind: 'none' },
  durationSeconds: 200,
  contentKind: 'song',
  genres: [],
}

const checkpoint = {
  serverId: 'srv-1',
  startedAt: 1_700_000_000,
  positionSeconds: 90,
  listenedSeconds: 120,
  sessionOpen: true,
  song,
}

beforeEach(() => { clearListenCheckpoint() })

describe('listenCheckpoint', () => {
  it('survives a round trip with everything a replay needs', () => {
    saveListenCheckpoint(checkpoint)

    // The whole song, not a reference to one: the replay runs before the
    // library has loaded, and a scrobble needs an artist and a title.
    expect(readListenCheckpoint()).toMatchObject({
      serverId: 'srv-1',
      startedAt: 1_700_000_000,
      positionSeconds: 90,
      listenedSeconds: 120,
      sessionOpen: true,
      song: { nativeId: 's1', title: 'Roygbiv', artist: { name: 'Boards of Canada' } },
    })
  })

  it('reads as nothing when no listen was left in flight', () => {
    expect(readListenCheckpoint()).toBeNull()
  })

  it('keeps only the most recent listen', () => {
    saveListenCheckpoint(checkpoint)
    saveListenCheckpoint({ ...checkpoint, startedAt: 1_700_000_900, positionSeconds: 5 })

    expect(readListenCheckpoint()).toMatchObject({ startedAt: 1_700_000_900, positionSeconds: 5 })
  })

  /**
   * The departure that clears this is reported a second after it happened, by
   * which time the heartbeat may already have written a record for the track
   * that has started. Clearing blindly would throw that one away and reopen
   * the hole for the new track.
   */
  describe('clearing after a departure', () => {
    it('drops the record for the listen that was reported', () => {
      saveListenCheckpoint(checkpoint)

      clearListenCheckpointFor('s1', 1_700_000_000)

      expect(readListenCheckpoint()).toBeNull()
    })

    it('leaves a record belonging to a different track alone', () => {
      saveListenCheckpoint({ ...checkpoint, song: { ...song, nativeId: 's2' } })

      clearListenCheckpointFor('s1', 1_700_000_000)

      expect(readListenCheckpoint()).not.toBeNull()
    })

    it('leaves the same track played again alone', () => {
      // Repeat-one: the second pass is a different listen, still in flight.
      saveListenCheckpoint({ ...checkpoint, startedAt: 1_700_000_900 })

      clearListenCheckpointFor('s1', 1_700_000_000)

      expect(readListenCheckpoint()).toMatchObject({ startedAt: 1_700_000_900 })
    })
  })
})
