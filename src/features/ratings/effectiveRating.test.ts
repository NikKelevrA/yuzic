import { effectiveRating } from './effectiveRating'

describe('effectiveRating', () => {
  it('shows what the server said when this device has written nothing', () => {
    expect(effectiveRating(4, undefined)).toBe(4)
  })

  it('shows what this device wrote, over anything the server said', () => {
    expect(effectiveRating(4, 2)).toBe(2)
  })

  it('keeps a rating the user has just cleared cleared', () => {
    // The whole reason this is a function: `override || reported` puts the
    // stale three stars back the instant the user takes them off.
    expect(effectiveRating(3, 0)).toBe(0)
  })

  it('stays undefined for a server that does not carry ratings at all', () => {
    expect(effectiveRating(undefined, undefined)).toBeUndefined()
  })
})
