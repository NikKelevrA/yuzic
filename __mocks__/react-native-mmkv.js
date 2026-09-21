/**
 * In-memory stand-in for `react-native-mmkv`.
 *
 * The real package ships ESM with a native module behind it, so Jest cannot
 * load it: it is outside `transformIgnorePatterns` and there is no native side
 * under the test runner anyway. Anything that persists — the installation id,
 * the downloads index, the local-files library — reaches storage through this
 * one module, so mocking here keeps those modules testable without threading a
 * storage parameter through their call sites purely for the tests' benefit.
 *
 * Behaviour matches the subset the app uses. Each `createMMKV({ id })` gets its
 * own backing map keyed by id, mirroring the real per-instance isolation.
 */
const stores = new Map();

function storeFor(id) {
  if (!stores.has(id)) stores.set(id, new Map());
  return stores.get(id);
}

export function createMMKV({ id = 'default' } = {}) {
  const store = storeFor(id);

  return {
    set(key, value) {
      store.set(key, String(value));
    },
    getString(key) {
      return store.has(key) ? store.get(key) : undefined;
    },
    remove(key) {
      store.delete(key);
    },
    clearAll() {
      store.clear();
    },
    // The real one rewrites the mmap'd file at its used size and drops the
    // memory cache. A Map has no dead space and no file, so there is nothing
    // to reclaim here — but it has to exist, or a caller's `trim()` throws
    // under test and passes for a no-op.
    trim() {},
    getAllKeys() {
      return [...store.keys()];
    },
    contains(key) {
      return store.has(key);
    },
  };
}
