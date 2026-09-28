import reducer, {
  addProfile,
  deleteProfile,
  editTheme,
  renameProfile,
  selectActiveProfile,
  selectProfiles,
  switchProfile,
  resetPalettes,
  selectActiveTheme,
  selectCoverAccentEnabled,
  selectListDensity,
  selectRadiusPreset,
  selectThemeColor,
  selectTranslucentDock,
  setCoverAccentEnabled,
  setRadiusPreset,
  setThemeColor,
  setTranslucentDock,
  setLiveAccent,
} from './state'
import { migrateAppearance } from './themeStore'
import { DEFAULT_THEME } from '@/features/theme/presets'

const fresh = () => reducer(undefined, { type: '@@init' })
const root = (settingsAppearance: ReturnType<typeof fresh>) => ({ settingsAppearance })

describe('the theme', () => {
  it('is the default look on a fresh install', () => {
    expect(selectActiveTheme(root(fresh()))).toEqual(DEFAULT_THEME)
    expect(selectRadiusPreset(root(fresh()))).toBe('default')
    expect(selectListDensity(root(fresh()))).toBe('default')
    expect(selectCoverAccentEnabled(root(fresh()))).toBe(true)
    expect(selectTranslucentDock(root(fresh()))).toBe(false)
  })

  // `home` was a third background scope, covering the Home tab alone. It is
  // gone, so a theme stored while it existed names a scope that matches no
  // branch: it would sit in the picker looking like "every screen" while
  // behaving like nothing. `tabs` is what it becomes — the photo stays on the
  // screen it was on, and gains that tab bar's two siblings.
  it('carries a stored home scope across to tabs', () => {
    const state = reducer(
      fresh(),
      editTheme({ surface: { backgroundScope: 'home' as 'tabs' } }),
    )
    expect(selectActiveTheme(root(state)).surface.backgroundScope).toBe('tabs')
  })

  it('leaves a stored tabs or everywhere scope alone', () => {
    for (const scope of ['tabs', 'everywhere'] as const) {
      const state = reducer(fresh(), editTheme({ surface: { backgroundScope: scope } }))
      expect(selectActiveTheme(root(state)).surface.backgroundScope).toBe(scope)
    }
  })

  it('is the same object until it changes, so nothing redraws for nothing', () => {
    const state = fresh()
    expect(selectActiveTheme(root(state))).toBe(selectActiveTheme(root({ ...state })))
  })

  it('takes every setter as an edit of the one theme', () => {
    let state = reducer(fresh(), setThemeColor('#123456'))
    state = reducer(state, setRadiusPreset('sharp'))
    state = reducer(state, setCoverAccentEnabled(false))
    state = reducer(state, setTranslucentDock(true))

    expect(selectThemeColor(root(state))).toBe('#123456')
    expect(selectRadiusPreset(root(state))).toBe('sharp')
    expect(selectCoverAccentEnabled(root(state))).toBe(false)
    expect(selectTranslucentDock(root(state))).toBe(true)
  })

  it('merges a palette edit into one scheme and leaves the rest alone', () => {
    const state = reducer(fresh(), editTheme({ palettes: { dark: { background: '#101010' } } }))
    const theme = selectActiveTheme(root(state))

    expect(theme.palettes.dark.background).toBe('#101010')
    expect(theme.palettes.dark.text).toBe(DEFAULT_THEME.palettes.dark.text)
    expect(theme.palettes.light).toEqual(DEFAULT_THEME.palettes.light)
  })

  it('resets the colours without touching the accent', () => {
    let state = reducer(fresh(), editTheme({ accent: '#123456', palettes: { dark: { background: '#101010' } } }))
    state = reducer(state, resetPalettes())

    expect(selectActiveTheme(root(state)).palettes).toEqual(DEFAULT_THEME.palettes)
    expect(selectThemeColor(root(state))).toBe('#123456')
  })
})

describe('upgrading from the old appearance settings', () => {
  it('keeps every choice someone made, over the default look', () => {
    const migrated = migrateAppearance({
      themeMode: 'dark', themeColor: '#0be881', radiusPreset: 'rounded', listDensity: 'compact',
      coverAccentEnabled: false, translucentDock: true, hapticsEnabled: false,
    })

    // The look someone had becomes a profile of their own, selected, so an
    // upgrade changes what the setting is called and not how the app looks.
    const mine = migrated.profiles.find((p: { id: string }) => p.id === migrated.activeProfileId)
    expect(mine.theme).toMatchObject({
      accent: '#0be881',
      shape: { radius: 'rounded', density: 'compact' },
      surface: { coverTint: false },
      components: { dock: 'translucent' },
    })
    expect(mine.theme.palettes).toEqual(DEFAULT_THEME.palettes)
    expect(mine.id).not.toBe('default')
    // ...and the Yuzic look is still there, untouched, to go back to.
    expect(migrated.profiles[0]).toMatchObject({ id: 'default', theme: DEFAULT_THEME })
    expect(migrated).toMatchObject({ themeMode: 'dark', hapticsEnabled: false })
    expect(migrated).not.toHaveProperty('themeColor')
    expect(migrated).not.toHaveProperty('theme')
  })

  it('carries the active theme across from a build that stored several', () => {
    const migrated = migrateAppearance({
      activeThemeId: 'custom-1',
      customThemes: [{ ...DEFAULT_THEME, id: 'custom-1', accent: '#abcdef' }],
    })

    const mine = migrated.profiles.find((p: { id: string }) => p.id === migrated.activeProfileId)
    expect(mine.theme.accent).toBe('#abcdef')
    expect(migrated).not.toHaveProperty('customThemes')
    expect(migrated).not.toHaveProperty('activeThemeId')
  })

  // `autoMergeLevel1` merges every stored top-level key into state, including
  // ones the reducer no longer declares, and the persistoid writes back what
  // it finds — so a key left behind by an earlier migration reads itself in
  // and writes itself out again on every launch, forever.
  it('drops the theme a profiles blob was migrated from', () => {
    const migrated = migrateAppearance({
      profiles: [{ id: 'default', theme: DEFAULT_THEME }],
      activeProfileId: 'default',
      themeMode: 'dark',
      theme: DEFAULT_THEME,
    })

    expect(migrated).not.toHaveProperty('theme')
    expect(migrated.profiles).toHaveLength(1)
    expect(migrated).toMatchObject({ activeProfileId: 'default', themeMode: 'dark' })
  })

  it('leaves an already-upgraded blob alone', () => {
    const current = fresh()
    expect(migrateAppearance(current)).toBe(current)
  })

  // Two identical profiles and a choice to make about nothing.
  it('does not give a stock look a copy of itself', () => {
    const migrated = migrateAppearance({ theme: DEFAULT_THEME, themeMode: 'system' })

    expect(migrated.profiles).toHaveLength(1)
    expect(migrated.activeProfileId).toBe('default')
  })
})

describe('an accent from what is playing', () => {
  it('stands in for the theme accent only while the theme follows the cover', () => {
    let state = reducer(fresh(), setLiveAccent('#336699'))
    expect(selectThemeColor(root(state))).toBe(DEFAULT_THEME.accent)

    state = reducer(state, editTheme({ accentFromCover: true }))
    expect(selectThemeColor(root(state))).toBe('#336699')

    state = reducer(state, setLiveAccent(null))
    expect(selectThemeColor(root(state))).toBe(DEFAULT_THEME.accent)
  })

  it('stops following the cover when an accent is picked', () => {
    let state = reducer(fresh(), editTheme({ accentFromCover: true }))
    state = reducer(state, setLiveAccent('#336699'))
    state = reducer(state, setThemeColor('#123456'))

    expect(selectActiveTheme(root(state)).accentFromCover).toBe(false)
    expect(selectThemeColor(root(state))).toBe('#123456')
  })
})

describe('appearance profiles', () => {
  const profiles = (state: ReturnType<typeof fresh>) => selectProfiles(root(state))
  const active = (state: ReturnType<typeof fresh>) => selectActiveProfile(root(state))

  it('ships one profile, the Yuzic look', () => {
    expect(profiles(fresh())).toHaveLength(1)
    expect(active(fresh())).toMatchObject({ id: 'default', theme: DEFAULT_THEME })
  })

  // The default is what every other profile is a departure from, and a
  // reference that can be edited is not a reference.
  it('forks the default rather than editing it', () => {
    const state = reducer(fresh(), setThemeColor('#123456'))

    expect(profiles(state)).toHaveLength(2)
    expect(profiles(state)[0]).toMatchObject({ id: 'default', theme: DEFAULT_THEME })
    expect(active(state).id).not.toBe('default')
    expect(selectThemeColor(root(state))).toBe('#123456')
  })

  it('keeps editing the fork rather than making another one', () => {
    let state = reducer(fresh(), setThemeColor('#123456'))
    state = reducer(state, setRadiusPreset('sharp'))

    expect(profiles(state)).toHaveLength(2)
    expect(selectRadiusPreset(root(state))).toBe('sharp')
  })

  it('leaves the Yuzic look to go back to', () => {
    let state = reducer(fresh(), setThemeColor('#123456'))
    state = reducer(state, switchProfile('default'))

    expect(selectActiveTheme(root(state))).toEqual(DEFAULT_THEME)
  })

  it('copies the profile in use when a new one is made', () => {
    let state = reducer(fresh(), setThemeColor('#123456'))
    state = reducer(state, addProfile({ name: 'Night' }))

    expect(profiles(state)).toHaveLength(3)
    expect(active(state)).toMatchObject({ name: 'Night' })
    // Copied, so it starts as the look it was made from rather than the stock one.
    expect(selectThemeColor(root(state))).toBe('#123456')
  })

  it('keeps the profiles apart once one of them is changed', () => {
    let state = reducer(fresh(), setThemeColor('#123456'))
    const firstId = active(state).id
    state = reducer(state, addProfile({ name: 'Night' }))
    state = reducer(state, setThemeColor('#abcdef'))

    expect(selectThemeColor(root(state))).toBe('#abcdef')
    state = reducer(state, switchProfile(firstId))
    expect(selectThemeColor(root(state))).toBe('#123456')
  })

  it('renames a profile, and refuses to rename the default', () => {
    let state = reducer(fresh(), addProfile({ name: 'Night' }))
    const id = active(state).id
    state = reducer(state, renameProfile({ id, name: 'Evening' }))
    expect(active(state)).toMatchObject({ name: 'Evening' })

    state = reducer(state, renameProfile({ id: 'default', name: 'Mine' }))
    expect(profiles(state)[0]).not.toHaveProperty('name')
  })

  it('falls back to the default when the profile in use is deleted', () => {
    let state = reducer(fresh(), addProfile({ name: 'Night' }))
    const id = active(state).id
    state = reducer(state, deleteProfile(id))

    expect(profiles(state)).toHaveLength(1)
    expect(active(state).id).toBe('default')
  })

  // A list of looks with nothing in it is not a state worth reaching.
  it('will not delete the default', () => {
    const state = reducer(fresh(), deleteProfile('default'))
    expect(profiles(state)).toHaveLength(1)
  })

  it('reuses a freed id rather than counting up forever', () => {
    let state = reducer(fresh(), addProfile({ name: 'One' }))
    const id = active(state).id
    state = reducer(state, deleteProfile(id))
    state = reducer(state, addProfile({ name: 'Two' }))

    expect(active(state).id).toBe(id)
  })

  // A stored id can name a profile that is no longer there.
  it('draws the first profile when the stored id names nothing', () => {
    const state = { ...fresh(), activeProfileId: 'gone' }
    expect(selectActiveTheme(root(state))).toEqual(DEFAULT_THEME)
  })
})
