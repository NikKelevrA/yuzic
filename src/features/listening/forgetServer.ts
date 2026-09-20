import { belongsToServer, dropServerNamespace } from '@/state/redux/serverScopedState';
import type { ListenEvent } from './listeningEvent';

/**
 * The parts of the listening state that are scoped to a server.
 *
 * Structural rather than the slice's own type, so this module does not import
 * the slice that calls it — and so the function can be tested against a plain
 * object rather than through a store.
 */
interface ServerScopedListening {
  events: ListenEvent[];
  totals: Record<string, unknown>;
  albums: Record<string, unknown>;
  artists: Record<string, unknown>;
  playlists: Record<string, unknown>;
}

/**
 * Drops one server's listening history, log and rollups together.
 *
 * The two halves need different treatment because they are stored differently:
 * the rollups are maps keyed `serverId:entityId` and can be dropped by prefix,
 * while the log is a flat list that carries its keys on each event.
 *
 * A listen belongs to a server if its *track* does. `album`, `artist` and
 * `playlist` are all keyed from the song's own provenance — deliberately, so a
 * track does not change hands when the listener switches server — so they
 * cannot disagree with the track about which server it came from.
 *
 * Clearing both is the same rule `clearListeningHistory` already follows:
 * dropping the events and leaving the totals would look like deletion without
 * being it.
 */
export function forgetServerListening(state: ServerScopedListening, serverId: string): void {
  state.events = state.events.filter(event => !belongsToServer(event.track, serverId));
  for (const map of [state.totals, state.albums, state.artists, state.playlists]) {
    dropServerNamespace(map, serverId);
  }
}
