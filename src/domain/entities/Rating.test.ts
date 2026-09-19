import { RATING_MAX, clampRating, reportedRating } from './Rating'

describe('clampRating', () => {
  it('keeps a value already on the scale', () => {
    for (let value = 0; value <= RATING_MAX; value += 1) {
      expect(clampRating(value)).toBe(value)
    }
  })

  it('rounds a half star to the nearer whole one', () => {
    // Plex stores out of ten, so 7 arrives here as 3.5.
    expect(clampRating(3.5)).toBe(4)
    expect(clampRating(2.4)).toBe(2)
  })

  it('pulls anything off the scale back onto it', () => {
    expect(clampRating(10)).toBe(RATING_MAX)
    expect(clampRating(-3)).toBe(0)
  })

  it('treats anything that is not a real number as no rating', () => {
    // Including an infinity, which is the one case where clamping it to five
    // would be the wrong answer: it is a broken payload, not a rave review.
    expect(clampRating(Number.NaN)).toBe(0)
    expect(clampRating(Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('reportedRating', () => {
  it('tells "the server said nothing" from "the user rated nothing"', () => {
    expect(reportedRating(undefined)).toBeUndefined()
    expect(reportedRating(null)).toBeUndefined()
    expect(reportedRating(0)).toBe(0)
  })

  it('puts what the server did say on the scale', () => {
    expect(reportedRating(4)).toBe(4)
    expect(reportedRating(9)).toBe(RATING_MAX)
  })
})
