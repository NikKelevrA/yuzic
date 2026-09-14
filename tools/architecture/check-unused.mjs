#!/usr/bin/env node
/**
 * Unused production exports.
 *
 * An export nothing imports is either dead code or an abstraction built for a
 * caller that never arrived. Both are things this rewrite removes rather than
 * carries forward.
 */
import { enforce } from './allowlist.mjs';
import { unusedExports } from './detectors.mjs';

process.exit(enforce('unused-exports', unusedExports()));
