#!/usr/bin/env node
/**
 * Import cycles.
 *
 * A cycle means two modules cannot be reasoned about, tested, or deleted
 * independently, which is exactly the property the rewrite is buying back.
 * Type-only imports count: a mutually-referential pair of entity types is one
 * of this codebase's cycles, and it is a modelling problem, not a bundler one.
 */
import { enforce } from './allowlist.mjs';
import { cycles } from './detectors.mjs';

process.exit(enforce('cycles', cycles().map(cycle => cycle.join(' -> '))));
