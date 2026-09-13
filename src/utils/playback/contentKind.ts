import type { ContentKind } from '@/types';

/**
 * Content-kind gates. A Song without an explicit contentKind is treated as a
 * regular song — the historical default before radio and podcasts existed —
 * so every songs-only callsite in the codebase continues to work with no
 * change.
 *
 * Kept as small helpers rather than a big `if` in each callsite: the intent
 * ("can I scrobble this?", "should I show a progress bar?") reads better than
 * the string comparison, and adding a new kind later means changing the
 * helpers, not every gate.
 *
 * Typed against a minimal structural shape rather than the legacy `@/types`
 * `Song` — these only ever read `.contentKind`, and the domain `Song`
 * (`@/domain/entities/Song`) uses the same `ContentKind` values, so this
 * works unchanged for both without a conversion at the call site.
 */
type ContentKindSource = { contentKind?: ContentKind } | null | undefined;

export function getContentKind(song: ContentKindSource): ContentKind {
  return song?.contentKind ?? 'song';
}

export function isLiveStream(song: ContentKindSource): boolean {
  return getContentKind(song) === 'liveStream';
}

export function isPodcastEpisode(song: ContentKindSource): boolean {
  return getContentKind(song) === 'podcastEpisode';
}

/** A live stream has no known duration — hide the progress bar, timestamps
 * and seek. Podcast episodes are finite audio; a progress bar makes sense. */
export function hasFiniteDuration(song: ContentKindSource): boolean {
  return !isLiveStream(song);
}

/** Only regular songs and podcast episodes are scrobbleable. Live streams
 * are continuous sessions (not discrete listens) and previews are 30s
 * external clips that shouldn't count as a real play. */
export function canScrobble(song: ContentKindSource): boolean {
  const k = getContentKind(song);
  return k === 'song' || k === 'podcastEpisode';
}

/** Skip within the "track" — 15s jump buttons. Off for live streams and
 * previews (which are already short enough that jumps don't make sense). */
export function canJumpWithin(song: ContentKindSource): boolean {
  const k = getContentKind(song);
  return k !== 'liveStream' && k !== 'preview';
}

/** Autoplay queue-fill from a seed. A radio station is its own infinite feed
 * and should not spawn recommendations at the end; a preview is a browsing
 * teaser, not a listening seed. */
export function canFillQueueFrom(song: ContentKindSource): boolean {
  return getContentKind(song) === 'song';
}

/** A synthetic id namespace for live streams routed through the Song shape,
 * so an id collision with a real track is impossible. */
export const LIVE_STREAM_ID_PREFIX = 'radio:';
export const PODCAST_EPISODE_ID_PREFIX = 'podcast:';
