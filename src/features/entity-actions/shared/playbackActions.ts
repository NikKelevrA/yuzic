import type { Song } from '@/domain/entities/Song';
import type { PlayableCollection } from '@/contexts/PlayingContext';

/**
 * The one "play a collection" implementation, shared by albums, artists and
 * playlists (songs have their own queue semantics — add-to-queue vs
 * add-to-end map onto `playNext`/`addToQueue` directly on the song, not onto
 * a collection). All three collection kinds used to duplicate:
 *   - play/shuffle: play the first song in-collection
 *   - "add to queue": if nothing is queued yet, play instead; otherwise
 *     append the collection
 *   - shuffle-to-queue: same fallback, shuffled
 *
 * Toasts on success are intentionally left to each caller via `onDone` — see
 * the entity-actions report: Album toasts on all three of these, Artist and
 * Playlist toast on none of them. That is a real, preserved difference, not
 * an oversight here.
 *
 * `addToNext` (reverse-iterate `playNext` so the collection ends up in order
 * right after the current song) is Album-only — Artist and Playlist never
 * had it. Kept as a separate opt-in function so kinds that never had it
 * don't gain it back silently.
 */
interface CollectionPlaybackDeps {
  playSongInCollection: (song: Song, collection: PlayableCollection, shuffle: boolean) => void;
  addCollectionToQueue: (collection: PlayableCollection) => void;
  shuffleCollectionToQueue: (collection: PlayableCollection) => void;
  getQueue: () => Song[];
  playNext: (song: Song) => void;
}

export function useCollectionPlaybackActions(deps: CollectionPlaybackDeps) {
  const play = (
    collection: PlayableCollection | null,
    songs: Song[],
    shuffle: boolean,
    close: () => void
  ) => {
    if (!collection || !songs.length) return;
    deps.playSongInCollection(songs[0], collection, shuffle);
    close();
  };

  const addToQueueOrPlay = (
    collection: PlayableCollection | null,
    songs: Song[],
    close: () => void,
    onDone?: () => void
  ) => {
    if (!collection || !songs.length) return;
    const hasQueue = deps.getQueue().length > 0;
    if (!hasQueue) {
      deps.playSongInCollection(songs[0], collection, false);
    } else {
      deps.addCollectionToQueue(collection);
      onDone?.();
    }
    close();
  };

  const shuffleToQueue = (
    collection: PlayableCollection | null,
    songs: Song[],
    close: () => void,
    onDone?: () => void
  ) => {
    if (!collection || !songs.length) return;
    const hasQueue = deps.getQueue().length > 0;
    if (!hasQueue) {
      deps.playSongInCollection(songs[0], collection, true);
    } else {
      deps.shuffleCollectionToQueue(collection);
      onDone?.();
    }
    close();
  };

  /** Album-only: see file doc. */
  const addToNext = (
    collection: PlayableCollection | null,
    songs: Song[],
    hasCurrentSong: boolean,
    close: () => void,
    onBlocked: () => void,
    onDone: () => void
  ) => {
    if (!collection || !songs.length) return;
    if (!hasCurrentSong) {
      onBlocked();
      return;
    }
    [...songs].reverse().forEach(song => deps.playNext(song));
    onDone();
    close();
  };

  return { play, addToQueueOrPlay, shuffleToQueue, addToNext };
}
