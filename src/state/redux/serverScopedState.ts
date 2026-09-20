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
 * In place, because every caller is an Immer draft inside a reducer.
 */
export function dropServerNamespace(map: Record<string, unknown>, serverId: string): void {
  const prefix = `${serverId}:`;
  for (const key of Object.keys(map)) {
    if (key.startsWith(prefix)) delete map[key];
  }
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
