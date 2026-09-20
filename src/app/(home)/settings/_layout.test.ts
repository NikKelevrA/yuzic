/**
 * Every settings route is declared in the layout.
 *
 * These screens all draw their own header, so each one is registered with
 * `headerShown: false`. A route file added without that line does not fail
 * anywhere — expo-router just falls back to its default native header, which
 * shows the *file name*: a "downtifyView" title under a "connectionsView"
 * back button, stacked on top of the screen's own header. That shipped.
 */
import fs from 'fs';
import path from 'path';

const dir = path.join(__dirname);

const routes = fs
  .readdirSync(dir)
  .filter(file => file.endsWith('.tsx') && !file.startsWith('_') && !file.includes('.test.'))
  .map(file => file.replace(/\.tsx$/, ''));

const layout = fs.readFileSync(path.join(dir, '_layout.tsx'), 'utf8');

describe('settings routes', () => {
  it('has routes to check', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it.each(routes)('declares %s in the layout', route => {
    expect(layout).toContain(`name='${route}'`);
  });

  it('gives every declared route its own header', () => {
    for (const route of routes) {
      const declaration = new RegExp(`name='${route}'[^/]*headerShown: false`);
      expect(layout).toMatch(declaration);
    }
  });
});
