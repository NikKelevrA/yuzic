import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const SETTINGS_ROUTES = path.join(ROOT, 'src/app/(home)/settings');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/**
 * Every settings screen has a way in.
 *
 * Three routes — Deezer, Last.fm, MusicBrainz — outlived the rows that opened
 * them. Nothing failed: the screens still built and the layout still
 * registered them, and the switches on them simply could no longer be reached.
 * A route nothing pushes is a screen nobody can open.
 */
describe('settings routes', () => {
  const routes = fs.readdirSync(SETTINGS_ROUTES)
    .filter(name => /\.tsx$/.test(name) && !['_layout.tsx', 'index.tsx'].includes(name))
    .map(name => name.replace(/\.tsx$/, ''));

  const appSource = sourceFiles(path.join(ROOT, 'src'))
    .filter(file => !file.startsWith(SETTINGS_ROUTES))
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');

  it('finds the settings routes to check', () => {
    expect(routes.length).toBeGreaterThan(5);
  });

  it.each(routes)('%s is opened from somewhere in the app', route => {
    expect(appSource).toContain(`/settings/${route}`);
  });
});
