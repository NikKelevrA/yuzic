import {
  hasDuration,
  isAutoplaySeed,
  isContinuous,
  isScrobbleable,
  isSeekable,
  hasReissuableUrl,
} from './ContentKind';
import type { ContentKind } from './ContentKind';

const ALL_KINDS: readonly ContentKind[] = ['song', 'liveStream', 'podcastEpisode', 'preview'];

describe('content kind behaviour', () => {
  const ASPECTS = [hasDuration, isScrobbleable, isSeekable, isAutoplaySeed, hasReissuableUrl, isContinuous];

  it('answers every aspect for every ContentKind', () => {
    // Totality: no kind falls through to undefined, which would read as false
    // at the call site and be wrong silently.
    for (const kind of ALL_KINDS) {
      for (const aspect of ASPECTS) expect(typeof aspect(kind)).toBe('boolean');
    }
  });

  it('song is scrobbleable, seekable, an autoplay seed, stream-refreshable, and has duration', () => {
    expect(ASPECTS.map(aspect => aspect('song'))).toEqual([true, true, true, true, true, false]);
  });

  it('only a live stream is continuous, which is what the engine reads it by', () => {
    // Regression: nothing told the engine a station has no end, so it read
    // one with a file parser that waits for the end of the broadcast, and no
    // station played.
    expect(isContinuous('liveStream')).toBe(true);
    for (const kind of ALL_KINDS.filter(other => other !== 'liveStream')) {
      expect(isContinuous(kind)).toBe(false);
    }
  });

  it('preview has duration but is not scrobbleable, not an autoplay seed, and not stream-refreshable', () => {
    expect(hasDuration('preview')).toBe(true);
    expect(isScrobbleable('preview')).toBe(false);
    expect(isAutoplaySeed('preview')).toBe(false);
    expect(hasReissuableUrl('preview')).toBe(false);
  });

  it('refuses to reissue a live stream URL, because the station owns it', () => {
    // Regression: routing a radio station through the server's stream builder
    // produces a URL for a track the server does not have, breaking radio
    // playback entirely and silently.
    expect(hasReissuableUrl('liveStream')).toBe(false);
    expect(hasReissuableUrl('song')).toBe(true);
    expect(hasReissuableUrl('podcastEpisode')).toBe(true);
  });

  it('liveStream has no duration and is not seekable', () => {
    expect(hasDuration('liveStream')).toBe(false);
    expect(isSeekable('liveStream')).toBe(false);
  });

  it('podcastEpisode has duration, is seekable and scrobbleable, but is not an autoplay seed', () => {
    // A finished episode is a listen. The table once said otherwise while the
    // player's own gate scrobbled episodes anyway; the player reads this table
    // now, so the rule it follows is the one written here.
    expect(hasDuration('podcastEpisode')).toBe(true);
    expect(isSeekable('podcastEpisode')).toBe(true);
    expect(isScrobbleable('podcastEpisode')).toBe(true);
    expect(isAutoplaySeed('podcastEpisode')).toBe(false);
  });
});
