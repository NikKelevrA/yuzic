/**
 * Which sources a playlist's recommendations are built from.
 *
 * The rail is two questions: "who sounds like this", which several sources
 * answer, and "what can I play by them", which only a catalogue can. It used
 * to name Last.fm for the first and require a switch of its own for it, so it
 * needed a key compiled into the build — and no shipped build carries one,
 * which is why the row has never appeared in one.
 */

const mockLastfmSimilar = jest.fn()
const mockRelatedArtists = jest.fn()
const mockResolveArtist = jest.fn()
const mockTopTracks = jest.fn()

jest.mock('@/providers/integration/lastfm/getSimilarArtists', () => ({
  getLastFmSimilarArtists: (...args: unknown[]) => mockLastfmSimilar(...args),
}))
jest.mock('@/providers/integration/deezer', () => ({
  getDeezerRelatedArtists: (...args: unknown[]) => mockRelatedArtists(...args),
  resolveDeezerArtistByName: (...args: unknown[]) => mockResolveArtist(...args),
  getDeezerArtistTopTracks: (...args: unknown[]) => mockTopTracks(...args),
}))

import { fetchPlaylistRecommendations } from './pageSources'

const song = (id: string) => ({
  nativeId: id,
  title: id,
  artist: { nativeId: 'a', name: 'Somebody' },
  album: { nativeId: 'al', title: 'Album' },
})

beforeEach(() => {
  jest.clearAllMocks()
  mockResolveArtist.mockResolvedValue({ nativeId: 'd1', name: 'Neighbour' })
  mockTopTracks.mockResolvedValue([song('t1'), song('t2')])
  mockRelatedArtists.mockResolvedValue([{ nativeId: 'r1', name: 'Neighbour' }])
  mockLastfmSimilar.mockResolvedValue([{ name: 'Scrobbled neighbour' }])
})

describe('fetchPlaylistRecommendations', () => {
  it('works from the catalogue alone, with no bundled key in play', async () => {
    const tracks = await fetchPlaylistRecommendations(['Seed'], { scrobbles: false, catalogue: true })

    expect(tracks.length).toBeGreaterThan(0)
    expect(mockRelatedArtists).toHaveBeenCalled()
    expect(mockLastfmSimilar).not.toHaveBeenCalled()
  })

  // The shipped reality: the build carries no Last.fm key, so asking for
  // scrobbles cannot produce anything. Before this change that ended the whole
  // rail; now it simply falls through to the source that can answer.
  it('falls through to the catalogue when scrobbles are wanted but unavailable', async () => {
    const tracks = await fetchPlaylistRecommendations(['Seed'], { scrobbles: true, catalogue: true })

    expect(tracks.length).toBeGreaterThan(0)
    expect(mockLastfmSimilar).not.toHaveBeenCalled()
    expect(mockRelatedArtists).toHaveBeenCalled()
  })

  it('asks nobody when no seed source is on', async () => {
    const tracks = await fetchPlaylistRecommendations(['Seed'], { scrobbles: false, catalogue: false })

    expect(tracks).toEqual([])
    expect(mockLastfmSimilar).not.toHaveBeenCalled()
    expect(mockRelatedArtists).not.toHaveBeenCalled()
  })

  it('asks nobody when the playlist has no artists to go on', async () => {
    expect(await fetchPlaylistRecommendations([], { scrobbles: true, catalogue: true })).toEqual([])
    expect(mockLastfmSimilar).not.toHaveBeenCalled()
  })

  // A discovery rail, not a critical path.
  it('gives back nothing rather than throwing when a source fails', async () => {
    mockRelatedArtists.mockRejectedValue(new Error('offline'))
    await expect(
      fetchPlaylistRecommendations(['Seed'], { scrobbles: false, catalogue: true })
    ).resolves.toEqual([])
  })
})

/**
 * The same function in a build that does carry the key, which is the only way
 * to see the first source answer at all.
 */
describe('fetchPlaylistRecommendations with a bundled key', () => {
  // `require` inside `isolateModules` rather than a dynamic import: the key is
  // read once when the module loads, so the only way to see the other build is
  // to load a second copy of it, and `import()` needs VM modules Jest is not
  // running with.
  const withKey = (): typeof fetchPlaylistRecommendations => {
    let fetch!: typeof fetchPlaylistRecommendations
    jest.isolateModules(() => {
      jest.doMock('@/constants/keys', () => ({ LASTFM_API_KEY: 'a-key' }))
      fetch = require('./pageSources').fetchPlaylistRecommendations
    })
    return fetch
  }

  // Falling through rather than merging: this is a seed list for the step
  // below, so more names from one source is worth no more than the first
  // source's, and asking two companies when one has answered is a request
  // nobody needed.
  it('stops at the first source that answers', async () => {
    await withKey()(['Seed'], { scrobbles: true, catalogue: true })

    expect(mockLastfmSimilar).toHaveBeenCalled()
    expect(mockRelatedArtists).not.toHaveBeenCalled()
  })

  it('goes on to the catalogue when the first answers nothing', async () => {
    mockLastfmSimilar.mockResolvedValue([])
    await withKey()(['Seed'], { scrobbles: true, catalogue: true })

    expect(mockRelatedArtists).toHaveBeenCalled()
  })
})
