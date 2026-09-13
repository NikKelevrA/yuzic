#!/usr/bin/env node
/**
 * Architecture baseline measurement.
 *
 * Emits a machine-readable snapshot of the structural facts the rewrite is
 * meant to move: how much code there is, where the cycles and dead exports
 * are, where provider names leak out of provider folders, and what the
 * adapter/capability surface currently looks like.
 *
 * Output is deterministic — every collection is sorted, no timestamps, no
 * absolute paths — so two runs on the same tree produce byte-identical JSON
 * and a later run can be diffed against the committed baseline.
 *
 *   node tools/architecture/measure.mjs            # write .hermes/rewrite-baseline.json
 *   node tools/architecture/measure.mjs --stdout   # print instead of writing
 *   node tools/architecture/measure.mjs --no-coverage
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const OUT = join(ROOT, '.hermes', 'rewrite-baseline.json');

const args = new Set(process.argv.slice(2));
const toStdout = args.has('--stdout');
const withCoverage = !args.has('--no-coverage');

/** Every .ts/.tsx file under src, as repo-relative POSIX paths, sorted. */
function sourceFiles() {
  const out = [];
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, full).split(sep).join('/'));
    }
  };
  walk(SRC);
  return out.sort();
}

const isTest = f => /\.(test|spec)\.tsx?$/.test(f) || f.includes('/__tests__/');
const lines = f => readFileSync(join(ROOT, f), 'utf8').split('\n').length;

/** Run a command, returning stdout even when it exits non-zero (these tools signal findings that way). */
function run(cmd, argv) {
  try {
    return execFileSync(cmd, argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (typeof err.stdout === 'string') return err.stdout;
    throw err;
  }
}

// --- size -------------------------------------------------------------------

function measureSize(files) {
  const prod = files.filter(f => !isTest(f));
  const tests = files.filter(isTest);
  const sum = list => list.reduce((n, f) => n + lines(f), 0);
  return {
    productionFiles: prod.length,
    productionLines: sum(prod),
    testFiles: tests.length,
    testLines: sum(tests),
  };
}

// --- file shape -------------------------------------------------------------

const LARGE_FILE_LINES = 400;

function measureLargeFiles(files) {
  return files
    .filter(f => !isTest(f))
    .map(f => ({ file: f, lines: lines(f) }))
    .filter(e => e.lines > LARGE_FILE_LINES)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file));
}

// --- unsafe casts -----------------------------------------------------------

const CAST_PATTERNS = [
  ['asAny', /\bas\s+any\b/],
  ['asUnknownAs', /\bas\s+unknown\s+as\b/],
  ['tsIgnore', /@ts-(ignore|expect-error)\b/],
  ['consoleLog', /\bconsole\.log\s*\(/],
];

function measureUnsafe(files) {
  const findings = {};
  for (const [key] of CAST_PATTERNS) findings[key] = [];
  for (const file of files) {
    if (isTest(file)) continue;
    const src = readFileSync(join(ROOT, file), 'utf8').split('\n');
    src.forEach((line, i) => {
      for (const [key, re] of CAST_PATTERNS) {
        if (re.test(line)) findings[key].push({ file, line: i + 1 });
      }
    });
  }
  for (const key of Object.keys(findings)) {
    findings[key].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  }
  return findings;
}

// --- provider-name leakage --------------------------------------------------

/** Provider names that may only appear inside that provider's own folder or the registry. */
const PROVIDER_NAMES = [
  'navidrome', 'jellyfin', 'emby', 'plex', 'deezer', 'musicbrainz', 'lastfm',
  'listenbrainz', 'lrclib', 'audiomuse', 'lidarr', 'slskd', 'soulsync',
];

/** Directories where naming a provider is legal: the implementations and the registry declarations. */
const PROVIDER_HOMES = [
  'src/api/',
  'src/utils/servers/registry.ts',
  'src/features/downloaders/registry',
  'src/features/sources/registry',
  'src/features/integrations/',
  'src/app/', // route files are named after their provider settings screen
  'src/locales/',
];

const isProviderHome = f => PROVIDER_HOMES.some(h => f.startsWith(h));

function measureProviderLeakage(files) {
  const leaks = [];
  for (const file of files) {
    if (isTest(file) || isProviderHome(file)) continue;
    const src = readFileSync(join(ROOT, file), 'utf8').split('\n');
    src.forEach((line, i) => {
      for (const name of PROVIDER_NAMES) {
        // Identifier-ish occurrences only: `navidrome`, `Navidrome`, `NAVIDROME`.
        const re = new RegExp(`\\b${name}\\b`, 'i');
        if (re.test(line)) leaks.push({ file, line: i + 1, provider: name });
      }
    });
  }
  return leaks.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.provider.localeCompare(b.provider));
}

// --- routes -----------------------------------------------------------------

function measureRoutes(files) {
  return files
    .filter(f => f.startsWith('src/app/') && f.endsWith('.tsx'))
    .map(f => f.slice('src/app/'.length))
    .sort();
}

// --- adapter and capability surface ----------------------------------------

/**
 * The ApiAdapter surface: each sub-API, whether it is required, and the methods
 * its interface declares. Read from the contract so the inventory cannot drift
 * from what adapters must actually implement.
 */
function measureAdapterSurface() {
  const src = readFileSync(join(SRC, 'api/types.ts'), 'utf8');

  /** Method names declared directly on an interface body. */
  const methodsOf = name => {
    // Sub-APIs are declared as either `interface X {` or `type X = {`.
    const block = src.match(new RegExp(`export (?:interface ${name} |type ${name} = )\\{([\\s\\S]*?)\\n\\}`));
    if (!block) return [];
    const names = [];
    for (const line of block[1].split('\n')) {
      const m = line.match(/^\s*(\w+)\??\s*[(:]/);
      if (m) names.push(m[1]);
    }
    return [...new Set(names)].sort();
  };

  const block = src.match(/export interface ApiAdapter \{([\s\S]*?)\n\}/);
  const members = [];
  if (block) {
    for (const line of block[1].split('\n')) {
      const m = line.match(/^\s*(\w+)(\??):\s*(\w+)/);
      if (m) members.push({ name: m[1], required: m[2] !== '?', type: m[3], methods: methodsOf(m[3]) });
    }
  }
  return members.sort((a, b) => a.name.localeCompare(b.name));
}

/** The CapabilitySlot union members, read from the contract. */
function measureCapabilitySlots() {
  const src = readFileSync(join(SRC, 'features/integrations/types.ts'), 'utf8').split('\n');
  const start = src.findIndex(l => l.startsWith('export type CapabilitySlot ='));
  if (start === -1) return [];
  const slots = [];
  // The union is written one member per line with a JSDoc line above each and no
  // trailing semicolon, so read forward and stop at the first line that is
  // neither a member, a comment, nor blank.
  for (let i = start + 1; i < src.length; i += 1) {
    const line = src[i].trim();
    const member = line.match(/^\|\s*'([^']+)'/);
    if (member) { slots.push(member[1]); continue; }
    if (line === '' || line.startsWith('/*') || line.startsWith('*')) continue;
    break;
  }
  return slots.sort();
}

/** Protocol implementations present under src/api. */
function measureProviderImplementations() {
  return readdirSync(SRC + '/api')
    .filter(name => statSync(join(SRC, 'api', name)).isDirectory())
    .sort();
}

// --- external tools ---------------------------------------------------------

function measureCycles() {
  const out = run('npx', ['--no-install', 'madge', '--circular', '--extensions', 'ts,tsx', '--json', 'src']);
  let parsed;
  try {
    parsed = JSON.parse(out.slice(out.indexOf('[')));
  } catch {
    return { error: 'madge output was not parseable JSON', cycles: [] };
  }
  return { cycles: parsed.map(c => c.slice().sort()).sort((a, b) => a[0].localeCompare(b[0])) };
}

function measureUnusedExports() {
  const out = run('npx', ['--no-install', 'ts-prune', '-p', 'tsconfig.json']);
  const entries = out
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => l.includes(':'))
    // ts-prune marks in-module-only usage separately; keep it, it is still a signal.
    .map(l => l.replace(/^.*?[/\\]?(src[/\\].*)$/, '$1').split(sep).join('/'))
    .filter(l => l.startsWith('src/'));
  return [...new Set(entries)].sort();
}

function measureTests() {
  const argv = ['jest', '--ci', '--silent', '--json', '--outputFile', '.hermes/.jest-result.json'];
  if (withCoverage) argv.push('--coverage', '--coverageReporters', 'json-summary');
  run('npx', ['--no-install', ...argv]);
  const result = JSON.parse(readFileSync(join(ROOT, '.hermes/.jest-result.json'), 'utf8'));
  const out = {
    suites: result.numTotalTestSuites,
    tests: result.numTotalTests,
    passed: result.numPassedTests,
    failed: result.numFailedTests,
  };
  if (withCoverage) {
    const summary = JSON.parse(readFileSync(join(ROOT, 'coverage/coverage-summary.json'), 'utf8'));
    const t = summary.total;
    out.coverage = {
      lines: t.lines.pct,
      statements: t.statements.pct,
      functions: t.functions.pct,
      branches: t.branches.pct,
    };
  }
  return out;
}

// --- main -------------------------------------------------------------------

const files = sourceFiles();
const unsafe = measureUnsafe(files);
const providerLeakage = measureProviderLeakage(files);
const cycles = measureCycles();
const unusedExports = measureUnusedExports();

const baseline = {
  schema: 'yuzic-architecture-baseline/1',
  size: measureSize(files),
  tests: measureTests(),
  cycles: cycles.cycles,
  cyclesError: cycles.error,
  unusedExports: { count: unusedExports.length, entries: unusedExports },
  unsafe: Object.fromEntries(Object.entries(unsafe).map(([k, v]) => [k, { count: v.length, entries: v }])),
  providerLeakage: { count: providerLeakage.length, entries: providerLeakage },
  largeFiles: { threshold: LARGE_FILE_LINES, entries: measureLargeFiles(files) },
  routes: measureRoutes(files),
  adapter: {
    apiAdapterMembers: measureAdapterSurface(),
    capabilitySlots: measureCapabilitySlots(),
    providerImplementations: measureProviderImplementations(),
  },
};

const json = JSON.stringify(baseline, null, 2) + '\n';
if (toStdout) {
  process.stdout.write(json);
} else {
  mkdirSync(join(ROOT, '.hermes'), { recursive: true });
  writeFileSync(OUT, json);
  process.stderr.write(`wrote ${relative(ROOT, OUT)}\n`);
}
