#!/usr/bin/env node
/**
 * Provider names outside provider implementations.
 *
 * Feature code should ask for a capability, never for a provider by name. Each
 * name that leaks into a feature is a branch someone has to find and edit again
 * the next time a provider is added.
 */
import { enforce } from './allowlist.mjs';
import { providerReferences } from './detectors.mjs';

// Keyed per file and provider rather than per line: a line number turns every
// reference below an inserted line into a spurious new violation. File
// granularity still ratchets — clearing a provider out of a file clears the
// entry — without failing on edits that moved code around.
const keys = providerReferences().map(r => `${r.file} ${r.provider}`);
process.exit(enforce('provider-branches', keys));
