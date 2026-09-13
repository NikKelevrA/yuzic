import {
  contentKindBehaviour,
  hasDuration,
  isAutoplaySeed,
  isScrobbleable,
  isSeekable,
  hasReissuableUrl,
} from './ContentKind';
import type { ContentKind } from './ContentKind';

const ALL_KINDS: readonly ContentKind[] = ['song', 'liveStream', 'podcastEpisode', 'preview'];

describe('contentKindBehaviour', () => {
  it('has a total behaviour entry for every ContentKind', () => {
    for (const kind of ALL_KINDS) {
      const behaviour = contentKindBehaviour(kind);
      expect(behaviour).toEqual(
        expect.objectContaining({
          hasDuration: expect.any(Boolean),
          isScrobbleable: expect.any(Boolean),
          isSeekable: expect.any(Boolean),
          isAutoplaySeed: expect.any(Boolean),
          hasReissuableUrl: expect.any(Boolean),
        })
      );
    }
  });

  it('song is scrobbleable, seekable, an autoplay seed, stream-refreshable, and has duration', () => {
    expect(contentKindBehaviour('song')).toEqual({
      hasDuration: true,
      isScrobbleable: true,
      isSeekable: true,
      isAutoplaySeed: true,
      hasReissuableUrl: true,
    });
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

  it('podcastEpisode has duration and is seekable, but not scrobbleable and not an autoplay seed', () => {
    expect(hasDuration('podcastEpisode')).toBe(true);
    expect(isSeekable('podcastEpisode')).toBe(true);
    expect(isScrobbleable('podcastEpisode')).toBe(false);
    expect(isAutoplaySeed('podcastEpisode')).toBe(false);
  });
});
