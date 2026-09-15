import type { PlayableResource } from './playableResource';

/**
 * Songs the app has handed to a surface that can start playback without it.
 *
 * A CarPlay or Android Auto selection queues tracks natively; the app hears
 * only the ids and the engine's thin record of each. The browse tree was
 * built from real songs, though — album, artist, cover and all — so each one
 * is remembered here by `localId`, and a car-started queue comes back as
 * those songs rather than as title-only shells rebuilt from the player item.
 *
 * Keyed by `localId`, so it holds at most one entry per distinct song the
 * library has offered the car: bounded by the library, overwritten as the tree
 * is rebuilt, which keeps each entry's stream URL the most recently built one.
 */
const known = new Map<string, PlayableResource>();

export function rememberResource(resource: PlayableResource): void {
  known.set(resource.song.localId, resource);
}

export function knownResource(localId: string): PlayableResource | null {
  return known.get(localId) ?? null;
}
