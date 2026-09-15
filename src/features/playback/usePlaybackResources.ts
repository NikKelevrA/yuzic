import { useCallback } from 'react';
import { useSelector } from 'react-redux';

import type { Song } from '@/domain/entities/Song';
import { hasReissuableUrl } from '@/domain/playback/ContentKind';
import { useDownloadActions } from '@/features/offline/DownloadContext';
import { mediaHeadersForSong } from '@/features/player/mediaHeaders';
import type { MediaItem } from '@/features/player/mediaItem';
import { selectPreferredCodec } from '@/features/settings/playback/state';
import { useQueueFillProviders } from '@/providers/registry/queueFillProviders';
import { useApi } from '@/providers/registry/useApi';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { buildTrackItem } from './buildTrackItem';
import { playableQuality } from './playableFormat';
import type { PlayableResource } from './playableResource';
import { useLatestRef } from './useLatestRef';
import { useStreamQuality } from './useStreamQuality';

export type PlaybackResources = ReturnType<typeof usePlaybackResources>;

/**
 * Turning songs into something the player can open: a stream or local file
 * per song, a media item per resource, and the sources Autoplay draws on.
 * Each reads the user's settings at the moment it is called, never the ones
 * in force when a queue was built.
 */
export function usePlaybackResources() {
  const api = useApi();
  const { getLocalPath } = useDownloadActions();
  const streamQuality = useLatestRef(useStreamQuality());
  const preferredCodec = useLatestRef(useSelector(selectPreferredCodec));
  // The active server's credentials become the request headers a protected
  // server needs on both the stream and the artwork fetch.
  const activeServer = useLatestRef(useSelector(selectActiveServer));
  const queueFillProviders = useLatestRef(useQueueFillProviders(api));

  /**
   * Every resource→media item crossing goes through here, so headers are
   * attached in one place whichever path — play, queue add, autoplay fill,
   * restore — built the queue. Unprotected servers get a plain item.
   */
  const buildItem = useCallback(
    (resource: PlayableResource): MediaItem =>
      buildTrackItem(resource, mediaHeadersForSong(activeServer.current, resource)),
    [activeServer]
  );
  const toMediaItems = useCallback(
    (resources: PlayableResource[]): MediaItem[] => resources.map(buildItem),
    [buildItem]
  );

  /**
   * Builds the stream URL for a song at the point of playing, never earlier.
   *
   * A local download takes priority and needs no URL at all. Otherwise the
   * real, credentialled URL is built from `streamId ?? nativeId` with the
   * user's current quality and codec. `null` means the server could not build
   * one right now; callers drop the track rather than queue something
   * unplayable.
   */
  const resolvePlayableSong = useCallback((song: Song): PlayableResource | null => {
    const localPath = getLocalPath(song.localId);
    if (localPath) return { song, streamUrl: localPath, filePath: localPath };
    // A preview clip is issued once and cannot be rebuilt, so `streamId`
    // carries the literal playable URL. Everything else is built fresh every
    // time rather than trusted from whatever was queued — that staleness is
    // exactly what made a restored queue play nothing.
    if (!hasReissuableUrl(song.contentKind)) {
      return song.streamId ? { song, streamUrl: song.streamId } : null;
    }
    // "Original" serves the untouched file, which the device may not be able
    // to decode at all; `playableQuality` transcodes those rather than fail.
    const quality = playableQuality({ mimeType: song.audio?.mimeType }, streamQuality.current);
    const url = api.songs.buildStreamUrl(song.streamId ?? song.nativeId, quality, preferredCodec.current);
    return url ? { song, streamUrl: url } : null;
  }, [api, getLocalPath, preferredCodec, streamQuality]);
  const resolve = useLatestRef(resolvePlayableSong);

  return { api, buildItem, toMediaItems, resolvePlayableSong, resolve, queueFillProviders };
}
