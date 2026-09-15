import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';
import { isPlayable } from '@/features/playback/playableResource';
import type { CollectionContext } from '@/domain/playback/CollectionContext';

/**
 * Whether the persisted queue should be restored now, and if not, what that
 * means for the attempt.
 *
 * Two questions ride on every skip, and they have different answers per
 * reason:
 *
 * - `final`: is it worth asking again? A library that has not hydrated yet
 *   will, so the restore waits for it. A queue the listener has already
 *   started is the opposite — restoring later would replace what they chose —
 *   so the attempt is over.
 * - `report`: was a restore wanted? "No active server" and "nothing persisted"
 *   are most launches and say nothing. The rest describe a queue that should
 *   have come back, which is what "my queue disappeared" is reporting, so they
 *   are worth a log line — once, not on every state change while the reason
 *   holds.
 */
type RestoreDecision =
  | { kind: 'restore' }
  | { kind: 'skip'; reason: string; final: boolean; report: boolean };

export function decideRestore(state: {
  activeServerId: string | null | undefined;
  persistedCount: number;
  persistedServerId: string | null | undefined;
  queueLoaded: boolean;
  libraryHydrated: boolean;
}): RestoreDecision {
  if (!state.activeServerId) return { kind: 'skip', reason: 'no active server', final: false, report: false };
  if (state.persistedCount === 0) return { kind: 'skip', reason: 'nothing persisted', final: false, report: false };
  if (state.persistedServerId !== state.activeServerId) {
    return {
      kind: 'skip',
      reason: `queue belongs to another server (${state.persistedServerId})`,
      // Switching back to that server makes it restorable again.
      final: false,
      report: true,
    };
  }
  if (state.queueLoaded) return { kind: 'skip', reason: 'a queue is already loaded', final: true, report: true };
  if (!state.libraryHydrated) return { kind: 'skip', reason: 'library not hydrated yet', final: false, report: true };
  return { kind: 'restore' };
}

/**
 * Rebuild a playable queue from the ids the last session persisted.
 *
 * Only ids are stored, so this has to find each song in the library again and
 * give it back a stream URL. Both halves have failed before:
 *
 * - the songs were handed on with no stream URL, on the assumption that
 *   whatever loaded them would re-derive it. The loader did not: it asserts
 *   its input is playable and throws when it is not, and the throw landed in a
 *   floating promise. The app showed the restored queue with the right track
 *   while the player had been given nothing, and the one-shot restore guard
 *   meant it never tried again — the queue was there, and play did nothing.
 *
 * - a song the library no longer has shifts every song after it up a slot, so
 *   the remembered index stops pointing at the remembered song.
 *
 * Unplayable songs are dropped rather than thrown on: one track the library
 * can no longer build a URL for should cost that track, not the whole queue.
 *
 * Persisted ids are `localId`s, not `nativeId`s — a persisted reference has to
 * survive being read back after the library has moved on, and only `localId`
 * is guaranteed to still mean the same track (see the identity note on
 * `PlayableResource`).
 */
export function buildRestoredQueue(args: {
  persistedIds: string[];
  /** The album or playlist each persisted id was queued from, aligned with
   * `persistedIds`. Ignored when it is not aligned — a queue saved before
   * these were recorded — so every track restores ad hoc instead. */
  persistedContexts?: (CollectionContext | null)[];
  persistedIndex: number;
  libraryTracks: Song[];
  /** Gives a song a stream URL — local file, or a freshly built one. Null
   * when neither is possible (e.g. the server can no longer build one). */
  resolve: (song: Song) => PlayableResource | null;
}): { queue: PlayableResource[]; contexts: (CollectionContext | null)[]; index: number } {
  const { persistedIds, persistedContexts, persistedIndex, libraryTracks, resolve } = args;
  const aligned = persistedContexts?.length === persistedIds.length;

  // Keyed by plain `string`, not `LocalId`: persisted ids come back from
  // storage/Redux as unbranded strings, and re-asserting the brand on read
  // would need a cast this migration avoids.
  const byId = new Map<string, Song>(libraryTracks.map((track) => [track.localId, track]));
  // Each track keeps its context through the drops, so a missing song cannot
  // shift the next one onto its neighbour's playlist.
  const restored = persistedIds.flatMap((id, position) => {
    const song = byId.get(id);
    const resource = song ? resolve(song) : null;
    if (!resource || !isPlayable(resource)) return [];
    return [{ resource, context: aligned ? persistedContexts[position] ?? null : null }];
  });
  const queue = restored.map((entry) => entry.resource);
  const contexts = restored.map((entry) => entry.context);

  if (queue.length === 0) return { queue: [], contexts: [], index: 0 };

  // Follow the remembered song by id rather than by position. The positional
  // fallback is only for the case where that song is itself one of the ones
  // that went missing.
  const rememberedId = persistedIds[persistedIndex];
  const found = rememberedId ? queue.findIndex((resource) => resource.song.localId === rememberedId) : -1;
  const index = found >= 0 ? found : Math.min(Math.max(persistedIndex, 0), queue.length - 1);

  return { queue, contexts, index };
}
