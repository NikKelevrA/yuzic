import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { Provenance } from '@/domain/identity/Provenance';

/**
 * One instance of each part that a catalog list repeats, instead of a copy per
 * entity.
 *
 * A track carries its origin, its artist and its album as nested objects, and
 * every one of them arrives as a fresh copy: `JSON.parse` has no way to express
 * "the same object as before", and the adapters' mappers build a new artist
 * reference for every track they map. So a library holds one `provenance` per
 * track where there is one origin, one artist reference per track where an
 * artist has hundreds of tracks, and one empty `externalIds` per entity and per
 * reference. Measured on a device, parsing 89,878 tracks shaped like the stored
 * ones: 103 MB of Hermes heap as parsed, 57 MB with these parts shared.
 *
 * `provenance` was already meant to be shared (see `serverProvenance`), and
 * the persisted catalog quietly undid that on every cold start.
 *
 * A part is shared only with one it is deeply equal to, so nothing anyone
 * reads changes: two references that name the same artist but spell it
 * differently stay two. And the parts are only ever read, never written in
 * place, which is what makes sharing them safe. The shared empty `externalIds`
 * is frozen so that an in-place write cannot give every entity the same id.
 * It is not loud about it: React Native compiles modules non-strict, where a
 * write to a frozen object is ignored rather than thrown.
 *
 * **Takes ownership of the list.** Entities are updated in place, so call it
 * only on a list just built by a fetch or a parse, before it reaches the cache.
 * A frozen entity is left as it is rather than written to.
 */
export function shareIdenticalParts<T>(list: T): T {
  if (!Array.isArray(list)) return list;
  const pools: Pools = { provenance: new Map(), refs: new Map(), genres: new Map() };
  for (const entity of list) shareInto(entity, pools);
  return list;
}

const EMPTY_EXTERNAL_IDS: ExternalIds = Object.freeze({});

/** An artist or album reference, as far as sharing it needs to know. */
interface Ref {
  localId?: unknown;
  externalIds?: ExternalIds;
}

interface Pools {
  provenance: Map<string, Provenance>;
  refs: Map<string, Ref>;
  genres: Map<string, string[]>;
}

interface Shareable {
  provenance?: Provenance;
  externalIds?: ExternalIds;
  artist?: Ref;
  album?: Ref;
  genres?: unknown;
}

function shareInto(value: unknown, pools: Pools): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  const entity = value as Shareable;

  if (entity.provenance) {
    entity.provenance = pooled(pools.provenance, provenanceKey(entity.provenance), entity.provenance);
  }
  if (entity.externalIds) entity.externalIds = sharedIfEmpty(entity.externalIds);

  for (const field of ['artist', 'album'] as const) {
    const ref = entity[field];
    if (!ref || typeof ref !== 'object' || typeof ref.localId !== 'string' || Object.isFrozen(ref)) continue;
    // Before pooling, so two references differing only in which empty object
    // they hold compare equal.
    if (ref.externalIds) ref.externalIds = sharedIfEmpty(ref.externalIds);
    entity[field] = pooled(pools.refs, `${field}\u0000${ref.localId}`, ref);
  }

  const genres = entity.genres;
  if (Array.isArray(genres) && genres.length && genres.every(genre => typeof genre === 'string')) {
    entity.genres = pooled(pools.genres, genres.join('\u0000'), genres as string[]);
  }
}

function provenanceKey(provenance: Provenance): string {
  return provenance.origin === 'server'
    ? `server\u0000${provenance.serverId}`
    : `${provenance.origin}\u0000${(provenance as { providerId?: string }).providerId ?? ''}`;
}

function sharedIfEmpty(ids: ExternalIds): ExternalIds {
  for (const key in ids) {
    if (Object.prototype.hasOwnProperty.call(ids, key)) return ids;
  }
  return EMPTY_EXTERNAL_IDS;
}

/** The pooled instance for `key` when it equals `value`, otherwise `value` itself. */
function pooled<V>(pool: Map<string, V>, key: string, value: V): V {
  const hit = pool.get(key);
  if (hit === undefined) {
    pool.set(key, value);
    return value;
  }
  return hit === value || deepEqual(hit, value) ? hit : value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}
