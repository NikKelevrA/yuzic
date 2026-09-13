import {
  selectEnabledSearchSourceIds,
  selectSearchSourceEnabled,
} from './state'

/**
 * Task 4.3: `selectSearchSourceEnabled` used to fall back to the older
 * `deezerSearchEnabled` flag when `searchSourcesEnabled` had no entry for
 * Deezer. That flag is gone — it was reachable only through a settings
 * screen that has been rewired to write `searchSourcesEnabled` directly
 * (see `screens/settings/integrations/deezer/index.tsx`) — so the fallback
 * is gone with it and every source now reads straight off the unified map.
 */
function stateWith(settingsSearch: Record<string, unknown>) {
  return { settingsSearch } as any
}

describe('selectSearchSourceEnabled', () => {
  it('is off by default for every source — enabling nothing without being asked', () => {
    const empty = stateWith({ searchSourcesEnabled: {} })
    expect(selectSearchSourceEnabled('deezer')(empty)).toBe(false)
    expect(selectSearchSourceEnabled('musicbrainz')(empty)).toBe(false)
  })

  it('reads the unified map once a source has an explicit entry', () => {
    const state = stateWith({ searchSourcesEnabled: { deezer: true, musicbrainz: false } })
    expect(selectSearchSourceEnabled('deezer')(state)).toBe(true)
    expect(selectSearchSourceEnabled('musicbrainz')(state)).toBe(false)
  })
})

describe('selectEnabledSearchSourceIds', () => {
  it('is empty by default — search enablement is independent of Home and starts off', () => {
    expect(selectEnabledSearchSourceIds(stateWith({ searchSourcesEnabled: {} }))).toEqual([])
  })

  it('is independent of Home/discovery enablement', () => {
    // Home/discovery fields aren't even part of this slice's state, so
    // there is nothing for search enablement to accidentally read.
    const state = stateWith({ searchSourcesEnabled: {}, deezerExternalEnabled: true, musicbrainzExternalEnabled: true })
    expect(selectEnabledSearchSourceIds(state)).toEqual([])
  })

  it('includes exactly the sources explicitly enabled for search', () => {
    const state = stateWith({ searchSourcesEnabled: { deezer: true, musicbrainz: true } })
    expect(selectEnabledSearchSourceIds(state).sort()).toEqual(['deezer', 'musicbrainz'])
  })
})
