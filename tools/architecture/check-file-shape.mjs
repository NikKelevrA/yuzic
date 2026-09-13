#!/usr/bin/env node
/**
 * File size as a shape signal.
 *
 * Size is not proof of bad architecture, but the files this rewrite replaces
 * are all large for the same reason: one module owning several
 * responsibilities. Orchestration files get the tighter limit, because that is
 * where the god objects grew.
 */
import { enforce } from './allowlist.mjs';
import { oversizedFiles } from './detectors.mjs';

const keys = oversizedFiles().map(f => `${f.file} (${f.lines} > ${f.limit})`);
process.exit(enforce('file-shape', keys));
