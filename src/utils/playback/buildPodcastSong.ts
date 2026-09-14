import type { PodcastChannel, PodcastEpisode } from '@/providers/contracts/ServerAdapter';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';

/**
 * Namespaces an episode's id so it can never collide with a real track's.
 * Exported because `needsSnapshot` reads it back to recognise an episode.
 */
export const PODCAST_EPISODE_ID_PREFIX = 'podcast:';

/**
 * Turns a podcast episode into something the player accepts.
 *
 * The id is prefixed, and the prefix is load-bearing in two places: it keeps an
 * episode from ever colliding with a real track in the queue, downloads or
 * history, and `needsSnapshot` reads it to decide that a resume position for an
 * episode must store a snapshot — an episode is never in the synced library, so
 * a bookmark without one is a row nothing can draw.
 *
 * No stream URL is produced. `streamId` is the id the server assigns only once
 * it has finished downloading the episode, which is why callers guard on it;
 * the URL is built from that at play time.
 */
export function podcastEpisodeToSong(
  episode: PodcastEpisode,
  channel: PodcastChannel | null,
  serverId: string
): Song {
  const provenance = serverProvenance(serverId);
  const nativeId = `${PODCAST_EPISODE_ID_PREFIX}${episode.id}`;
  const cover = channel?.coverArt
    ? ({ kind: 'navidrome', coverArtId: channel.coverArt } as const)
    : ({ kind: 'none' } as const);
  const channelId = channel?.id ?? episode.channelId;

  return {
    localId: makeLocalId('song', provenance, nativeId),
    nativeId,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: episode.title,
    // A podcast's "artist" and "album" are both its channel: that is what the
    // player's now-playing surfaces and the lock screen have to show.
    artist: {
      localId: makeLocalId('artist', provenance, channelId),
      nativeId: channelId,
      externalIds: {},
      name: channel?.title ?? 'Podcast',
      cover,
    },
    album: {
      localId: makeLocalId('album', provenance, channelId),
      nativeId: channelId,
      externalIds: {},
      title: channel?.title ?? 'Podcast',
      cover,
    },
    cover,
    durationSeconds: episode.durationSeconds ?? 0,
    contentKind: 'podcastEpisode',
    streamId: episode.playableStreamId ?? undefined,
    genres: [],
  };
}
