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

// Keyed on the path alone. Embedding the line count would make a file that
// grew from 691 to 692 lines read as one violation fixed and another created,
// which says nothing true — the file was over the limit before and after.
// Growth within the allowlist is reported by the baseline measurement instead.
const oversized = oversizedFiles();
const describe = file => {
  const entry = oversized.find(f => f.file === file);
  return entry ? `${file} (${entry.lines} > ${entry.limit})` : file;
};

process.exit(enforce('file-shape', oversized.map(f => f.file), describe));
