import {
  selectEnabledSearchSourceIds,
  selectSearchSourceEnabled,
  migrateSearchSettings,
} from './state'

/**
 * Task 4.3: `selectSearchSourceEnabled` used to fall back to the older
 * `deezerSearchEnabled` flag when `searchSourcesEnabled` had no entry for
 * Deezer. That flag is gone, so the fallback is gone with it and every
 * source now reads straight off the unified map (written by Online sources
 * and the Search filter sheet).
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
    // Home/discovery fields aren't part of this slice's state, so there is
    // nothing for search enablement to accidentally read.
    const state = stateWith({ searchSourcesEnabled: {} })
    expect(selectEnabledSearchSourceIds(state)).toEqual([])
  })

  it('includes exactly the sources explicitly enabled for search', () => {
    const state = stateWith({ searchSourcesEnabled: { deezer: true, musicbrainz: true } })
    expect(selectEnabledSearchSourceIds(state).sort()).toEqual(['deezer', 'musicbrainz'])
  })
})

/**
 * The per-source "external data" flags were retired into the source switch. A
 * user who had a source's external pages on must still have them.
 */
describe('migrateSearchSettings', () => {
  it('turns a source on for anyone who had its external pages on', () => {
    const migrated = migrateSearchSettings({
      searchScope: 'server',
      searchSourcesEnabled: { deezer: false },
      deezerExternalEnabled: true,
      musicbrainzExternalEnabled: true,
    })
    expect(migrated.searchSourcesEnabled).toEqual({ deezer: true, musicbrainz: true })
    expect(migrated).not.toHaveProperty('deezerExternalEnabled')
    expect(migrated).not.toHaveProperty('musicbrainzExternalEnabled')
  })

  it('leaves a source alone when its external flag was off', () => {
    const migrated = migrateSearchSettings({
      searchSourcesEnabled: { musicbrainz: true },
      deezerExternalEnabled: false,
      musicbrainzExternalEnabled: false,
    })
    expect(migrated.searchSourcesEnabled).toEqual({ musicbrainz: true })
  })

  it('passes a fresh install through', () => {
    expect(migrateSearchSettings(undefined)).toBeUndefined()
  })
})
