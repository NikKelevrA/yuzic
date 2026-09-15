import type { CollectionContext } from '@/domain/playback/CollectionContext';
import { RootState } from '@/state/redux/store';

/** One stable empty list, so state saved before contexts existed doesn't re-render per read. */
const NO_QUEUE_CONTEXTS: (CollectionContext | null)[] = [];

export const selectPersistedPlaybackQueue = (s: RootState) => s.playback.queueSongIds;
export const selectPersistedPlaybackQueueContexts = (s: RootState) =>
  s.playback.queueContexts ?? NO_QUEUE_CONTEXTS;
export const selectPersistedPlaybackCurrentIndex = (s: RootState) => s.playback.currentIndex;
export const selectPersistedPlaybackPositionMs = (s: RootState) => s.playback.positionMs;
export const selectPersistedPlaybackRepeatMode = (s: RootState) => s.playback.repeatMode;
export const selectPersistedPlaybackShuffleMode = (s: RootState) => s.playback.shuffleMode;
export const selectPersistedPlaybackActiveServerId = (s: RootState) => s.playback.activeServerId;
export const selectPersistedPlaybackBookmarks = (s: RootState) => s.playback.bookmarks;
