/**
 * Forgetting a server, everywhere it left something behind.
 *
 * Nine slices hold state scoped to a server and none of them used to drop it
 * when the server was removed. Server ids are `nanoid()` at credential save, so
 * a remove-and-re-add — the usual remedy when a connection misbehaves — issues
 * a new id and orphans every row written under the old one. Orphans are not
 * merely stale: they are unreachable, because every selector that reads them
 * filters on the *active* server's id or prefix, and they are persisted, so
 * they survive restarts and accumulate for the life of the install.
 *
 * `statsSlice` had already learned the shape of this once, for a different
 * trigger — its `replaceNamespace` exists because a map "only ever merged into"
 * grew without bound across library churn. This is the same fault reached by
 * removing the server rather than by the library changing under it, which is
 * why that function now delegates here rather than keeping a second copy of
 * the loop.
 *
 * Two storage shapes need it, so there are two functions and no clever
 * unification: a map keyed `serverId:entityId`, and a map keyed by server id
 * whose values are that server's whole sub-state.
 */

/**
 * Drops every entry a server owns from a map keyed `serverId:entityId`.
 *
 * In place, because every caller is an Immer draft inside a reducer. Fine for
 * the maps that stay small; see {@link withoutServerNamespace} for the ones
 * that do not, and for why the difference matters more than it looks.
 */
export function dropServerNamespace(map: Record<string, unknown>, serverId: string): void {
  const prefix = `${serverId}:`;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) delete map[key];
  }
}

/**
 * The same, as a new map, for the maps with a row per track.
 *
 * **`delete` in a loop is not viable at library scale on Hermes.** Replacing a
 * server's song stats means dropping one entry per track before writing the
 * new ones, and at 89,878 tracks that loop of deletes took the JS heap from
 * 220 MB to 2.4 GB in a few seconds and aborted the VM — `Max heap size was
 * exceeded`, with the whole library otherwise sitting comfortably. The same
 * reducer on node runs in 750 ms and allocates nothing much, which is why the
 * tests never saw it: deleting properties one at a time from an object with
 * ninety thousand of them is a shape Hermes handles very differently.
 *
 * It only ever bit on the *second* sync, because the first has nothing to
 * drop — which is exactly the sort of bug that reaches users and not CI.
 *
 * Building the survivors into a fresh object is O(n) on any engine and is what
 * the caller wanted anyway: it is replacing a namespace, not editing one.
 */
export function withoutServerNamespace<T>(
  map: Readonly<Record<string, T>>,
  serverId: string
): Record<string, T> {
  const prefix = `${serverId}:`;
  const kept: Record<string, T> = {};
  for (const key of Object.keys(map)) {
    if (!key.startsWith(prefix)) kept[key] = map[key];
  }
  return kept;
}

/**
 * Whether a `serverId:entityId` key belongs to a server.
 *
 * For the places that filter a list rather than a map — the listen log keeps
 * its keys on each event instead of in the index.
 */
export function belongsToServer(key: string | undefined, serverId: string): boolean {
  return key !== undefined && key.startsWith(`${serverId}:`);
}
