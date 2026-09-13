import type { Song } from '@/domain/entities/Song';
import type { PlayableResource } from '@/features/playback/playableResource';
import { playableOnly } from '@/features/playback/playableResource';

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
  persistedIndex: number;
  libraryTracks: Song[];
  /** Gives a song a stream URL — local file, or a freshly built one. Null
   * when neither is possible (e.g. the server can no longer build one). */
  resolve: (song: Song) => PlayableResource | null;
}): { queue: PlayableResource[]; index: number } {
  const { persistedIds, persistedIndex, libraryTracks, resolve } = args;

  // Keyed by plain `string`, not `LocalId`: persisted ids come back from
  // storage/Redux as unbranded strings, and re-asserting the brand on read
  // would need a cast this migration avoids.
  const byId = new Map<string, Song>(libraryTracks.map((track) => [track.localId, track]));
  const queue = playableOnly(
    persistedIds
      .map((id) => byId.get(id))
      .filter((song): song is Song => Boolean(song))
      .map(resolve)
      .filter((resource): resource is PlayableResource => Boolean(resource))
  );

  if (queue.length === 0) return { queue: [], index: 0 };

  // Follow the remembered song by id rather than by position. The positional
  // fallback is only for the case where that song is itself one of the ones
  // that went missing.
  const rememberedId = persistedIds[persistedIndex];
  const found = rememberedId ? queue.findIndex((resource) => resource.song.localId === rememberedId) : -1;
  const index = found >= 0 ? found : Math.min(Math.max(persistedIndex, 0), queue.length - 1);

  return { queue, index };
}
