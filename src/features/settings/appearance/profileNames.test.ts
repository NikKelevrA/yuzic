import { disambiguate } from './profileNames'

/**
 * Profiles can honestly share a name: the upgrade names the look someone had,
 * forking the default names its copy the same way, and nothing stops a user
 * typing one twice.
 */

describe('disambiguate', () => {
  it('leaves names that stand on their own alone', () => {
    expect(disambiguate(['Yuzic', 'Night', 'Car'])).toEqual(['Yuzic', 'Night', 'Car'])
  })

  it('numbers repeats from the second one, leaving the first as it was', () => {
    expect(disambiguate(['Yuzic', 'My look', 'My look'])).toEqual(['Yuzic', 'My look', 'My look 2'])
  })

  it('counts each name on its own', () => {
    expect(disambiguate(['A', 'B', 'A', 'B', 'A'])).toEqual(['A', 'B', 'A 2', 'B 2', 'A 3'])
  })

  it('keeps the list the same length and order', () => {
    const names = ['x', 'x', 'y']
    expect(disambiguate(names)).toHaveLength(names.length)
    expect(disambiguate([])).toEqual([])
  })
})
