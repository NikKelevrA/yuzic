// Global test double for the keystore. Individual suites that care about
// what was read/written (src/state/credentials.test.ts,
// credentialCache.test.ts) declare their own `jest.mock('expo-secure-store',
// ...)`, which takes precedence over this file for that suite. This one
// exists for every other suite that merely sits downstream of
// `src/state/credentials.ts` (through credentialCache, the registry, or a
// selector) and needs the module to resolve to something at all — expo-
// secure-store's own source is untranspiled ESM that Jest can't parse
// without it.
module.exports = {
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK: 'afterFirstUnlock',
};
