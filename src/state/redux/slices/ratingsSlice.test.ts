import reducer, {
  clearRatingOverride,
  clearServerRatings,
  selectRatingOverrides,
  setRatingOverride,
} from './ratingsSlice'

const empty = reducer(undefined, { type: '@@INIT' })
const withRating = (
  state: ReturnType<typeof reducer>,
  serverId: string,
  nativeId: string,
  rating: number
) => reducer(state, setRatingOverride({ serverId, nativeId, rating }))

describe('ratings overlay', () => {
  it('remembers what the user just gave something', () => {
    const state = withRating(empty, 'nav', 'track-1', 4)
    expect(selectRatingOverrides('nav')({ ratings: state })).toEqual({ 'track-1': 4 })
  })

  it('keeps a cleared rating, rather than forgetting it wrote one', () => {
    // The case the overlay exists for: the catalog still says three stars, and
    // dropping the key would let that stale reading win straight back.
    const rated = withRating(empty, 'nav', 'track-1', 3)
    const cleared = withRating(rated, 'nav', 'track-1', 0)
    expect(selectRatingOverrides('nav')({ ratings: cleared })['track-1']).toBe(0)
  })

  it('puts a value off the scale back onto it', () => {
    const state = withRating(empty, 'nav', 'track-1', 9)
    expect(selectRatingOverrides('nav')({ ratings: state })['track-1']).toBe(5)
  })

  it('takes an entry back when the server refused the write', () => {
    const rated = withRating(empty, 'nav', 'track-1', 4)
    const reverted = reducer(rated, clearRatingOverride({ serverId: 'nav', nativeId: 'track-1' }))
    expect(selectRatingOverrides('nav')({ ratings: reverted })['track-1']).toBeUndefined()
  })

  it('keeps each server to itself, so one id never means two things', () => {
    const both = withRating(withRating(empty, 'nav', 'shared-id', 5), 'other', 'shared-id', 1)
    expect(selectRatingOverrides('nav')({ ratings: both })['shared-id']).toBe(5)
    expect(selectRatingOverrides('other')({ ratings: both })['shared-id']).toBe(1)
  })

  it('forgets a server once a sync has brought its ratings back in the catalog', () => {
    const both = withRating(withRating(empty, 'nav', 'a', 5), 'other', 'b', 2)
    const synced = reducer(both, clearServerRatings('nav'))
    expect(selectRatingOverrides('nav')({ ratings: synced })).toEqual({})
    expect(selectRatingOverrides('other')({ ratings: synced })['b']).toBe(2)
  })

  it('returns one shared empty map, so a server with no ratings does not re-render', () => {
    const select = selectRatingOverrides('nobody')
    expect(select({ ratings: empty })).toBe(select({ ratings: empty }))
    expect(selectRatingOverrides(undefined)({ ratings: empty })).toBe(select({ ratings: empty }))
  })

  it('ignores a write with nothing to key it by', () => {
    const state = withRating(empty, '', 'track-1', 4)
    expect(state).toEqual(empty)
  })
})
