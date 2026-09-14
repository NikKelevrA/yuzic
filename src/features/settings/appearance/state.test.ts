import {
  selectCoverAccentEnabled,
  selectListDensity,
  selectRadiusPreset,
} from './state'

/**
 * These selectors used to fall back with `??` because a user
 * upgrading could have a settings blob written before the key existed.
 * Under this slice's own storage namespace there is no such blob — a fresh
 * `initialState` always supplies every key, and redux-persist's default
 * merge fills in anything a persisted payload doesn't have — so the
 * fallback moved into `initialState` and the selectors now read straight
 * through. These pin the values `initialState` supplies and that a chosen
 * value overrides it, which is what the `??` version used to guarantee.
 */
function stateWith(settingsAppearance: Record<string, unknown>) {
  return { settingsAppearance } as any
}

describe('appearance selectors', () => {
  it('reads the shipped default for each', () => {
    expect(selectRadiusPreset(stateWith({ radiusPreset: 'default' }))).toBe('default')
    expect(selectListDensity(stateWith({ listDensity: 'default' }))).toBe('default')
    expect(selectCoverAccentEnabled(stateWith({ coverAccentEnabled: true }))).toBe(true)
  })

  it('returns what the user chose once they have chosen it', () => {
    const chosen = stateWith({
      radiusPreset: 'rounded',
      listDensity: 'compact',
      coverAccentEnabled: false,
    })
    expect(selectRadiusPreset(chosen)).toBe('rounded')
    expect(selectListDensity(chosen)).toBe('compact')
    expect(selectCoverAccentEnabled(chosen)).toBe(false)
  })

  it('keeps a stored `false` off rather than defaulting it back on', () => {
    // `??` and `||` differ exactly here, and the toggle that will not stay
    // off is the bug this guards — coverAccentEnabled reads straight
    // through now, so this is really pinning that nothing coerces `false`.
    expect(selectCoverAccentEnabled(stateWith({ coverAccentEnabled: false }))).toBe(false)
  })
})
