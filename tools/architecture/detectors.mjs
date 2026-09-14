/**
 * The structural detectors, in one place.
 *
 * Both the gates (tools/architecture/check-*.mjs) and the baseline measurement
 * (tools/architecture/measure.mjs) read from here, so the number a gate
 * enforces and the number the baseline records can never disagree — they did
 * twice while this was written, each time because a matcher was improved on
 * one side only.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isTest, sourceFiles } from './allowlist.mjs';

/** Run a tool, keeping stdout even on a non-zero exit — these signal findings that way. */
function run(cmd, argv) {
  try {
    return execFileSync(cmd, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (typeof err.stdout === 'string') return err.stdout;
    throw err;
  }
}

// --- cycles -----------------------------------------------------------------

/**
 * Import cycles, each rotated to a canonical starting member so the entry does
 * not depend on which module madge happened to enter from. Resolution options,
 * including the TypeScript path aliases, come from .madgerc.
 */
export function cycles() {
  const out = run('npx', ['--no-install', 'madge', '--circular', '--json', 'src']);
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed
    .map(cycle => {
      const first = [...cycle].sort()[0];
      const start = cycle.indexOf(first);
      return [...cycle.slice(start), ...cycle.slice(0, start)];
    })
    .sort((a, b) => a.join(' ').localeCompare(b.join(' ')));
}

// --- unused exports ---------------------------------------------------------

/**
 * Production exports nothing imports. Test files are excluded: their exports
 * are fixtures the runner reaches in a way ts-prune cannot see, and they are
 * not production surface either way.
 *
 * Reads its own tsconfig, not the app's: see tsconfig.prune.json. Against the
 * app's, every `@/` import of a directory was unresolved, and exports reached
 * only that way were reported unused — false positives the allowlist had been
 * carrying since the gate went in.
 */
export function unusedExports() {
  const out = run('npx', ['--no-install', 'ts-prune', '-p', 'tools/architecture/tsconfig.prune.json']);
  return [...new Set(
    out
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^.*?(src[/\\].*)$/, '$1').replace(/\\/g, '/'))
      .filter(line => line.startsWith('src/'))
      .filter(line => !isTest(line.split(':')[0]))
      // Drop ts-prune's line number: `path:12 - name` becomes `path - name`.
      // Keying on the line would make every export below an inserted line read
      // as simultaneously new and fixed, so the gate would churn on edits that
      // changed nothing it cares about.
      .map(line => line.replace(/^([^:]+):\d+\s*/, '$1 '))
  )].sort();
}

// --- provider names ---------------------------------------------------------

export const PROVIDER_NAMES = [
  'navidrome', 'jellyfin', 'emby', 'plex', 'deezer', 'musicbrainz', 'lastfm',
  'listenbrainz', 'lrclib', 'audiomuse', 'lidarr', 'slskd', 'soulsync',
];

/** Where naming a provider is part of the job rather than a leak. */
const PROVIDER_HOMES = [
  'src/providers/server/',               // the server protocol implementations themselves
  'src/providers/integration/',          // the integration protocol implementations themselves
  'src/utils/servers/registry.ts',       // server provider declarations
  'src/features/downloaders/registry',   // downloader declarations
  'src/features/sources/registry',       // external source declarations
  'src/providers/registry/',             // where a provider declares itself
  'src/features/integrations/',          // the capability contract and registry
  'src/app/',                            // route files named after a provider's settings screen
  'src/locales/',                        // product names are user-facing copy
];

/**
 * Match a provider name as a whole word OR as a camelCase segment, so
 * `useDeezerArtist` and `deezerSearchEnabled` count as naming Deezer — those
 * are the identifiers a leak actually hides in; a `\b`-delimited matcher
 * missed 373 of them. Casing is spelled out rather than using the `i` flag,
 * because a case-insensitive substring reports `complex` and `duplex` as
 * naming Plex.
 */
function providerMatcher(name) {
  const lower = name.toLowerCase();
  const capital = lower[0].toUpperCase() + lower.slice(1);
  return new RegExp([
    `\\b${lower}`,               // deezer, deezerSearchEnabled
    `(?<=[a-z0-9])${capital}`,   // useDeezerArtist
    `\\b${capital}`,             // Deezer, DeezerIcon
    `\\b${lower.toUpperCase()}`, // DEEZER_API_KEY
  ].join('|'));
}

const PROVIDER_MATCHERS = PROVIDER_NAMES.map(name => [name, providerMatcher(name)]);

/**
 * Blanks out comments so the gate measures code rather than prose.
 *
 * A doc comment saying a capability is "filled by Jellyfin today" is useful
 * and is not a branch; a `switch` on a provider name is the thing being
 * hunted. Matching comments made the two indistinguishable and punished
 * writing the explanation down.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .split('\n')
    .map(line => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

export function providerReferences(files = sourceFiles()) {
  const found = [];
  for (const file of files) {
    if (isTest(file) || PROVIDER_HOMES.some(home => file.startsWith(home))) continue;
    stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, index) => {
      for (const [name, pattern] of PROVIDER_MATCHERS) {
        if (pattern.test(line)) found.push({ file, line: index + 1, provider: name });
      }
    });
  }
  return found.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.provider.localeCompare(b.provider));
}

// --- unsafe escapes ---------------------------------------------------------

/**
 * Patterns checked against code with comments blanked out. `as any` written in
 * a sentence ("same as any other result") is prose, not a cast, and flagging it
 * taught people to avoid the phrase rather than avoid the cast.
 */
export const UNSAFE_PATTERNS = [
  ['as-any', /\bas\s+any\b/],
  ['double-cast', /\bas\s+unknown\s+as\b/],
  // Only the directive form counts. `@ts-ignore` written mid-sentence is prose
  // about a suppression, not a suppression.
  ['console-log', /\bconsole\.log\s*\(/],
];

/**
 * Checked against the raw source, because a suppression *is* a comment. Only
 * the directive form counts: `@ts-ignore` mid-sentence is prose about one.
 */
const SUPPRESSION_PATTERN = /(^|\/\/|\/\*|\*)\s*@ts-(ignore|expect-error)\b/;

export function unsafeEscapes(files = sourceFiles()) {
  const found = [];
  for (const file of files) {
    if (isTest(file)) continue;
    const raw = readFileSync(file, 'utf8');
    const code = stripComments(raw).split('\n');
    raw.split('\n').forEach((rawLine, index) => {
      for (const [kind, pattern] of UNSAFE_PATTERNS) {
        if (pattern.test(code[index] ?? '')) found.push({ kind, file, line: index + 1 });
      }
      if (SUPPRESSION_PATTERN.test(rawLine)) {
        found.push({ kind: 'ts-suppression', file, line: index + 1 });
      }
    });
  }
  return found.sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

// --- file shape -------------------------------------------------------------

export const GENERAL_LIMIT = 400;
export const ORCHESTRATION_LIMIT = 250;

/** Coordinators, contexts and slices: the shapes that grow by absorbing neighbours. */
const isOrchestration = file =>
  /(Context|Coordinator|Controller|Provider)\.tsx?$/.test(file) ||
  /Slice\.ts$/.test(file) ||
  file.includes('/contexts/');

export function oversizedFiles(files = sourceFiles()) {
  const found = [];
  for (const file of files) {
    if (isTest(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n').length;
    const limit = isOrchestration(file) ? ORCHESTRATION_LIMIT : GENERAL_LIMIT;
    if (lines > limit) found.push({ file, lines, limit });
  }
  return found.sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}
