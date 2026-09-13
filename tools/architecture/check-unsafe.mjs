#!/usr/bin/env node
/**
 * Unsafe escapes in production code.
 *
 * `as any`, a double cast, a suppressed type error and a stray `console.log`
 * are each a place where the type system or the logger was talked out of doing
 * its job. They are cheap to add and invisible afterwards, so they are counted.
 */
import { enforce } from './allowlist.mjs';
import { unsafeEscapes } from './detectors.mjs';

const keys = unsafeEscapes().map(e => `${e.kind} ${e.file}:${e.line}`);
process.exit(enforce('unsafe', keys));
