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

const keys = providerReferences().map(r => `${r.file}:${r.line} ${r.provider}`);
process.exit(enforce('provider-branches', keys));
