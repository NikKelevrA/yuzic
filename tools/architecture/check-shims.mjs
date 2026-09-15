#!/usr/bin/env node
/**
 * Compatibility shims, which this rewrite bans outright.
 *
 * The rewrite branch is the isolation boundary: it uses a new storage
 * namespace, reads no legacy keys, and replaces each old path in the same
 * phase that introduces its replacement. So there is nothing to stay
 * compatible with, and a bridge between the old and new models is never the
 * answer to a type that does not line up.
 *
 * This gate exists because that reasoning is not obvious from inside a single
 * file. Five separate attempts at this migration reached for one of these
 * shapes — a `toLegacyX` converter, a `Song as LegacySong` alias, a
 * `legacyCompat` module — each justified by backwards compatibility with
 * persisted data that the new namespace guarantees does not exist. Every one
 * had to be reverted. A grep is a cheaper reviewer than a person.
 */
import { readFileSync } from 'node:fs';
import { enforce, isTest, sourceFiles } from './allowlist.mjs';

const PATTERNS = [
  // A converter between the two models, whatever it is called.
  ['legacy-converter', /\b(to|from)Legacy[A-Z]\w*\s*[(<]/],
  // Importing the old model under a new name to keep it callable.
  ['legacy-alias', /\bas\s+Legacy[A-Z]\w*\b/],
  // A module whose whole purpose is bridging.
  ['compat-module', /\b\w*(legacyCompat|compatAdapter|legacyBridge)\w*\b/],
];

function violations() {
  const found = [];
  for (const file of sourceFiles()) {
    if (isTest(file)) continue;
    readFileSync(file, 'utf8').split('\n').forEach(line => {
      for (const [kind, pattern] of PATTERNS) {
        if (pattern.test(line)) found.push(`${kind} ${file}`);
      }
    });
  }
  return found;
}

process.exit(enforce('shims', violations()));
