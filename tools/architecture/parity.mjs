#!/usr/bin/env node
/**
 * Rewrite parity matrix: generate and validate.
 *
 * Rows are derived from the measured baseline inventory, never hand-listed, so
 * a row cannot be quietly dropped by forgetting to write it down. Generating
 * over an existing matrix preserves the verification fields already recorded
 * and reports rows that appeared or disappeared since the last generation.
 *
 * This file is temporary rewrite bookkeeping. It is deleted at cutover; the
 * shipped architecture's truth lives in docs/architecture.md and
 * docs/integrations.md.
 *
 *   node tools/architecture/parity.mjs generate   # seed/refresh rows
 *   node tools/architecture/parity.mjs validate   # fail on missing/duplicate/pending
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASELINE = join(ROOT, '.hermes', 'rewrite-baseline.json');
const MATRIX = join(ROOT, '.hermes', 'rewrite-parity.json');

const command = process.argv[2] ?? 'validate';

const VERIFICATION_FIELDS = ['unit', 'integration', 'negativeControl'];
const PLATFORM_FIELDS = ['ios', 'android'];

/** Rows the baseline inventory can prove exist today. Later phases add their own owners. */
function deriveRows(baseline) {
  const rows = [];

  for (const member of baseline.adapter.apiAdapterMembers) {
    for (const method of member.methods) {
      rows.push({
        id: `adapter.${member.name}.${method}`,
        owner: 'providers/server',
        legacyEvidence: `src/providers/contracts/ServerAdapter.ts ${member.type}.${method}`,
        replacementEvidence: '',
        platforms: 'na',
        optional: !member.required,
      });
    }
  }

  for (const slot of baseline.adapter.capabilities) {
    rows.push({
      id: `capability.${slot}`,
      owner: 'providers/registry',
      legacyEvidence: `src/providers/contracts/Capabilities.ts CapabilityMap '${slot}'`,
      replacementEvidence: '',
      platforms: 'na',
      optional: false,
    });
  }

  for (const provider of baseline.adapter.providerImplementations) {
    rows.push({
      id: `provider.${provider}`,
      owner: 'providers',
      legacyEvidence: `src/api/${provider}/`,
      replacementEvidence: '',
      platforms: 'na',
      optional: false,
    });
  }

  for (const route of baseline.routes) {
    rows.push({
      id: `route.${route}`,
      owner: 'app',
      legacyEvidence: `src/app/${route}`,
      replacementEvidence: '',
      platforms: 'na',
      optional: false,
    });
  }

  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function blankRow(derived) {
  const row = {
    id: derived.id,
    owner: derived.owner,
    legacyEvidence: derived.legacyEvidence,
    replacementEvidence: derived.replacementEvidence,
    unit: 'pending',
    integration: 'pending',
    ios: derived.platforms === 'na' ? 'na' : 'pending',
    android: derived.platforms === 'na' ? 'na' : 'pending',
    negativeControl: 'pending',
  };
  if (derived.optional) row.optional = true;
  return row;
}

function generate() {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const derived = deriveRows(baseline);
  const existing = existsSync(MATRIX)
    ? new Map(JSON.parse(readFileSync(MATRIX, 'utf8')).rows.map(r => [r.id, r]))
    : new Map();

  const rows = derived.map(d => {
    const prior = existing.get(d.id);
    // Keep recorded verification state; always refresh the derived evidence.
    return prior
      ? { ...blankRow(d), ...prior, legacyEvidence: d.legacyEvidence, owner: d.owner }
      : blankRow(d);
  });

  const derivedIds = new Set(derived.map(d => d.id));
  const dropped = [...existing.keys()].filter(id => !derivedIds.has(id)).sort();
  const added = derived.filter(d => !existing.has(d.id)).map(d => d.id);

  writeFileSync(MATRIX, JSON.stringify({ schema: 'yuzic-rewrite-parity/1', rows }, null, 2) + '\n');
  process.stderr.write(`rows: ${rows.length} (+${added.length} new, -${dropped.length} gone)\n`);
  if (dropped.length) process.stderr.write(`gone: ${dropped.join(', ')}\n`);
}

function validate() {
  if (!existsSync(MATRIX)) {
    process.stderr.write(`missing ${MATRIX}; run: node tools/architecture/parity.mjs generate\n`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { rows } = JSON.parse(readFileSync(MATRIX, 'utf8'));
  const failures = [];

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) failures.push(`duplicate row: ${row.id}`);
    seen.add(row.id);
  }

  for (const derived of deriveRows(baseline)) {
    if (!seen.has(derived.id)) failures.push(`missing row: ${derived.id}`);
  }

  for (const row of rows) {
    if (!row.replacementEvidence) failures.push(`no replacement evidence: ${row.id}`);
    for (const field of [...VERIFICATION_FIELDS, ...PLATFORM_FIELDS]) {
      if (row[field] === 'pending') failures.push(`pending ${field}: ${row.id}`);
    }
  }

  if (failures.length) {
    process.stderr.write(`parity matrix not clean (${failures.length} problems)\n`);
    for (const f of failures.slice(0, 40)) process.stderr.write(`  ${f}\n`);
    if (failures.length > 40) process.stderr.write(`  ... and ${failures.length - 40} more\n`);
    process.exit(1);
  }
  process.stderr.write(`parity matrix clean: ${rows.length} rows\n`);
}

if (command === 'generate') generate();
else if (command === 'validate') validate();
else {
  process.stderr.write('usage: parity.mjs generate|validate\n');
  process.exit(2);
}
