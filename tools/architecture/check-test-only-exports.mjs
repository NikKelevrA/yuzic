#!/usr/bin/env node
/**
 * Exports whose only caller is a test.
 *
 * `check-unused` runs ts-prune, which counts a test import as a use. So an
 * export nothing in the app calls passes that gate while being dead: the code
 * stays, its spec stays, and both read as a supported API. Twenty-one were
 * found the first time this ran, including a whole domain model that every
 * entity carried and no screen ever asked a question of.
 *
 * Some exports genuinely exist for tests — a reset between cases, a snapshot
 * of module state. The repo names those with a leading underscore, and this
 * gate takes the prefix as the declaration of intent: `_resetCatalogStore` is
 * a seam, `getToasts` was not. Marking one is a deliberate act, which is the
 * point; anything else here is dead code with a spec attached.
 *
 * Deliberately a text scan rather than a type-aware one. It is looking for
 * *absence* of a caller, and a name that appears nowhere else in production is
 * absent under any definition — a false positive would have to be a name used
 * only through a dynamic lookup, which this codebase does not do.
 */
import { readFileSync } from 'node:fs';
import { enforce, isTest, sourceFiles } from './allowlist.mjs';

/** Named exports, minus the default and re-export forms that name no symbol. */
const EXPORTED = /export\s+(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

function violations() {
  const files = sourceFiles();
  const production = files.filter(file => !isTest(file));
  const tests = files.filter(isTest);

  const read = new Map(files.map(file => [file, readFileSync(file, 'utf8')]));
  const productionText = production.map(file => read.get(file)).join('\n');
  const testText = tests.map(file => read.get(file)).join('\n');

  const found = [];
  for (const file of production) {
    for (const [, name] of read.get(file).matchAll(EXPORTED)) {
      if (name.startsWith('_')) continue;
      const uses = new RegExp(`\\b${name}\\b`, 'g');
      // One occurrence across production is the declaration itself.
      const inProduction = (productionText.match(uses) ?? []).length;
      const inTests = (testText.match(uses) ?? []).length;
      if (inProduction <= 1 && inTests > 0) found.push(`${file} ${name}`);
    }
  }
  return found;
}

process.exit(enforce('test-only-exports', violations()));
