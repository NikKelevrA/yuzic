/**
 * The settings routes: declared, headed, and reachable.
 *
 * Every settings screen draws its own header, so each is registered with
 * `headerShown: false`. A route file added without that line does not fail
 * anywhere — expo-router falls back to its default native header, which shows
 * the *file name*: a "downtifyView" title under a "connectionsView" back
 * button, stacked on top of the screen's own header. That shipped once.
 *
 * And a route nothing pushes is a screen nobody can open. Three of them —
 * Deezer, Last.fm, MusicBrainz — once outlived the rows that opened them.
 * Nothing failed: the screens still built, the layout still registered them,
 * and the switches on them simply could no longer be reached.
 *
 * **This test lives outside `src/app` on purpose.** Expo Router builds its
 * routes with `require.context` over that directory, which pulls every file
 * in it into the bundle — test files included. The first version of the
 * header check sat next to the layout and imported `fs`, which does not exist
 * in React Native, so the bundle failed to build. Jest passed, lint passed,
 * tsc passed, and the app would not start. Nothing that reads the filesystem
 * can live under the router root, which is what the last case here enforces.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const ROUTER_ROOT = path.join(SRC, 'app');
const SETTINGS = path.join(ROUTER_ROOT, '(home)', 'settings');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
      ? [full]
      : [];
  });
}

const routes = fs
  .readdirSync(SETTINGS)
  .filter(file => file.endsWith('.tsx') && !file.startsWith('_'))
  .map(file => file.replace(/\.tsx$/, ''));

const layout = fs.readFileSync(path.join(SETTINGS, '_layout.tsx'), 'utf8');

/** `index` is the settings screen itself; the tab bar opens it, not a row. */
const openable = routes.filter(route => route !== 'index');

const appSource = sourceFiles(SRC)
  .filter(file => !file.startsWith(SETTINGS))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');

describe('settings routes', () => {
  it('finds the route files to check', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes)('declares %s in the layout', route => {
    expect(layout).toContain(`name='${route}'`);
  });

  it('gives every declared route its own header', () => {
    for (const route of routes) {
      expect(layout).toMatch(new RegExp(`name='${route}'[^/]*headerShown: false`));
    }
  });

  it.each(openable)('%s is opened from somewhere in the app', route => {
    expect(appSource).toContain(`/settings/${route}`);
  });

  it('keeps every file under the router root bundle-safe', () => {
    // The router bundles this directory wholesale, so nothing in it may reach
    // for anything Node-only. This is the rule the first version of the header
    // check broke, by being a test file that lived here.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
          offenders.push(path.relative(ROUTER_ROOT, full));
        }
      }
    };
    walk(ROUTER_ROOT);

    expect(offenders).toEqual([]);
  });
});
