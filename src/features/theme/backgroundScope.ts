import type { Theme } from './theme';

/**
 * How far the background image reaches, decided from the route alone.
 *
 * Deliberately a leaf, like `screenBackgroundContext`: `ScreenBackground`
 * imports `expo-image` and the router, so a test that only wants to ask which
 * routes are covered would have had to stand up both. The part that can be
 * wrong is this predicate, so it lives where it can be tested on its own.
 */

/** The tab roots, as expo-router segments them. Anything else is a pushed screen. */
const TAB_GROUPS = ['(home)', '(search)', '(library)'] as const;

/**
 * The tab group this route is the root of, or null if it is anywhere else.
 *
 * **`index` is not a segment.** `expo-router` pops a trailing `index` before
 * handing the segments over (`global-state/routeInfo.js`), so the Home tab root
 * is `['(home)', '(tabs)', '(home)']` and never ends in `index`. Testing for
 * one meant no route was ever a tab root, which turned the per-tab scope off
 * and left "everywhere" — the one branch that returns before this — as the only
 * setting that did anything.
 *
 * The trailing `index` is still tolerated rather than assumed absent: this
 * asked the router about its own private normalisation, and being wrong about
 * it in the other direction should not cost the feature a second time.
 */
function tabRootGroup(segments: string[]): string | null {
  const last = segments[segments.length - 1] === 'index'
    ? segments[segments.length - 2]
    : segments[segments.length - 1];
  return (TAB_GROUPS as readonly string[]).includes(last) ? last : null;
}

/** Whether this route wears the background, for a given scope. */
export function coversRoute(
  scope: Theme['surface']['backgroundScope'],
  segments: string[],
): boolean {
  if (scope === 'everywhere') return true;
  return tabRootGroup(segments) !== null;
}
