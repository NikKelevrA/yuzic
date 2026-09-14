import searchReducer, { selectSearchScope, setSearchScope } from './state'

/**
 * Search settings are only where a search runs. Which outside catalogues it
 * may query moved to each source's search use (`settings/sources/state`).
 */
describe('search settings', () => {
  it('searches the server by default', () => {
    const state = { settingsSearch: searchReducer(undefined, { type: 'init' }) }
    expect(selectSearchScope(state)).toBe('server')
  })

  it('writes the chosen scope', () => {
    const settingsSearch = searchReducer(undefined, setSearchScope('client'))
    expect(selectSearchScope({ settingsSearch })).toBe('client')
  })
})
