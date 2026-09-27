import { coversRoute } from './backgroundScope'

/**
 * Which routes the background image reaches, per `backgroundScope`.
 *
 * The scope has regressed once already — see the `index`-segment note in
 * `ScreenBackground.tsx` — and left `everywhere`, the one branch that returns
 * before consulting the route, as the only setting that did anything. It had
 * no test then.
 *
 * The segment arrays below are not invented: they are what `expo-router`'s own
 * `getRouteInfoFromState` returns for this app's route tree, trailing `index`
 * already popped by the router.
 */

const HOME_TAB = ['(home)', '(tabs)', '(home)']
const SEARCH_TAB = ['(home)', '(tabs)', '(search)']
const LIBRARY_TAB = ['(home)', '(tabs)', '(library)']
const ALBUM_FROM_HOME = ['(home)', '(tabs)', '(home)', 'albumView']
const SETTINGS = ['(home)', 'settings']

describe('coversRoute', () => {
  it('covers every tab root under tabs', () => {
    expect(coversRoute('tabs', HOME_TAB)).toBe(true)
    expect(coversRoute('tabs', SEARCH_TAB)).toBe(true)
    expect(coversRoute('tabs', LIBRARY_TAB)).toBe(true)
  })

  it('stops at pushed screens and settings under tabs', () => {
    expect(coversRoute('tabs', ALBUM_FROM_HOME)).toBe(false)
    expect(coversRoute('tabs', SETTINGS)).toBe(false)
  })

  it('covers everything under everywhere', () => {
    expect(coversRoute('everywhere', HOME_TAB)).toBe(true)
    expect(coversRoute('everywhere', ALBUM_FROM_HOME)).toBe(true)
    expect(coversRoute('everywhere', SETTINGS)).toBe(true)
  })

  // Before the router has mounted there is no route to match, and `everywhere`
  // is the only scope that does not need one.
  it('shows nothing but everywhere before route info arrives', () => {
    expect(coversRoute('tabs', [])).toBe(false)
    expect(coversRoute('everywhere', [])).toBe(true)
  })

  // A tab root still matches with the trailing `index` present: the router
  // pops it today, and being wrong about that private detail is what broke
  // this once already.
  it('tolerates a trailing index segment', () => {
    expect(coversRoute('tabs', [...HOME_TAB, 'index'])).toBe(true)
  })
})
