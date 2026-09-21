/**
 * The shared store must not outlive the catalog it was built from.
 *
 * `useCatalogStore` caches one store at module scope so that fifteen rows on
 * one screen do not build fifteen indexes. Held strongly, that cache is a
 * module-level reference to an entire library — the arrays, every entity in
 * them, and the indexes over them — which nothing can reclaim and which
 * survives every unmount. A sync replaces the arrays in the query cache, and
 * until something re-renders the cache still points at the previous ones, so
 * the device holds two libraries instead of one.
 *
 * Measured on a 44,939 track catalog on an emulator: replacing the tracks
 * array added 109 MB of live JS heap, again on every replacement, and
 * clearing this one cache gave back exactly 109 MB. Nothing else held it.
 * With the refs weak the same loop stays flat, and an 89,878 track library
 * that used to abort inside Hermes now syncs and scrolls.
 *
 * **Why this reads the source.** The property is "does not keep this alive",
 * and the only way to observe it is to collect and look, which needs a jest
 * started with `--expose-gc` and still comes out flaky — a local still in
 * scope or a fiber React has not dropped and the run is a false failure. A
 * guard that fails at random is worse than none. So this asserts the shape
 * that gives the property instead, the same way `settingsRoutes` asserts the
 * shape of the router directory: blunt, deterministic, and it fails on
 * exactly the change that would bring the leak back.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'useCatalogStore.ts'), 'utf8');

/** The `let shared: {...} | null = null;` declaration, body included. */
const declaration = /let shared:\s*\{([\s\S]*?)\}\s*\|\s*null/.exec(source)?.[1];

describe('the shared catalog store cache', () => {
  it('declares a cache to check', () => {
    expect(declaration).toBeDefined();
  });

  it.each(['songs', 'albums', 'artists', 'playlists', 'store'])(
    'holds %s weakly',
    field => {
      expect(declaration).toMatch(new RegExp(`${field}:\\s*WeakRef<`));
    }
  );

  it('reads the cache through deref, so a collected entry rebuilds', () => {
    // The other half: weak fields are no use if the lookup assumes they are
    // still there. Every read of the entry has to go through `deref`.
    const reads = source.match(/shared[?.]*\.\w+/g) ?? [];
    const withoutDeref = reads.filter(read => !source.includes(`${read}.deref()`));

    expect(withoutDeref).toEqual([]);
  });
});
