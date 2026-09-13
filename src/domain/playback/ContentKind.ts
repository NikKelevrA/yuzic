/**
 * What kind of thing is playing.
 *
 * A regular song is the common case: known duration, scrobbleable, safe to
 * seek within, and a valid seed for autoplay. Radio, podcasts and previews
 * each break some of those assumptions, and the player has to know which
 * before it draws a progress bar or reports a listen.
 *
 * This is required on every playable entity rather than defaulted. A missing
 * `contentKind` used to mean "song", which meant a synthesised live stream or
 * a 30-second preview clip silently inherited song behaviour — scrobbled,
 * seeked, and used to seed autoplay — until someone noticed.
 */
export type ContentKind = 'song' | 'liveStream' | 'podcastEpisode' | 'preview';

/** What each kind supports. One table, so the rules cannot disagree per call site. */
interface ContentKindBehaviour {
  /** Has a known, finite duration a progress bar can be drawn against. */
  hasDuration: boolean;
  /** May be reported as a listen to a scrobble destination. */
  isScrobbleable: boolean;
  /** The user may seek within it. */
  isSeekable: boolean;
  /** May be used as a seed for autoplay/queue filling. */
  isAutoplaySeed: boolean;
  /** Its stream URL can be rebuilt later, so a failure is worth retrying. */
  isStreamRefreshable: boolean;
}

const BEHAVIOUR: Record<ContentKind, ContentKindBehaviour> = {
  song: {
    hasDuration: true,
    isScrobbleable: true,
    isSeekable: true,
    isAutoplaySeed: true,
    isStreamRefreshable: true,
  },
  liveStream: {
    hasDuration: false,
    isScrobbleable: false,
    isSeekable: false,
    isAutoplaySeed: false,
    isStreamRefreshable: true,
  },
  podcastEpisode: {
    hasDuration: true,
    isScrobbleable: false,
    isSeekable: true,
    isAutoplaySeed: false,
    isStreamRefreshable: true,
  },
  // A 30-second external clip. Finite, but not a listen and not a seed, and
  // its URL is issued once — a failure removes the track rather than retrying.
  preview: {
    hasDuration: true,
    isScrobbleable: false,
    isSeekable: true,
    isAutoplaySeed: false,
    isStreamRefreshable: false,
  },
};

export const contentKindBehaviour = (kind: ContentKind): ContentKindBehaviour => BEHAVIOUR[kind];

export const hasDuration = (kind: ContentKind): boolean => BEHAVIOUR[kind].hasDuration;
export const isScrobbleable = (kind: ContentKind): boolean => BEHAVIOUR[kind].isScrobbleable;
export const isSeekable = (kind: ContentKind): boolean => BEHAVIOUR[kind].isSeekable;
export const isAutoplaySeed = (kind: ContentKind): boolean => BEHAVIOUR[kind].isAutoplaySeed;
export const isStreamRefreshable = (kind: ContentKind): boolean => BEHAVIOUR[kind].isStreamRefreshable;
