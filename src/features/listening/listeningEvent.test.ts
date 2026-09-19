import {
  FINISHED_SLACK_SECONDS,
  SESSION_GAP_MS,
  completionOf,
  endingFrom,
  countsAsPlay,
  isRejection,
  sessionFor,
  type ListenEvent,
} from './listeningEvent';

const event = (over: Partial<ListenEvent> = {}): ListenEvent => ({
  at: 1_700_000_000_000,
  track: 's1:t1',
  seconds: 200,
  duration: 240,
  ending: 'finished',
  session: 1,
  ...over,
});

describe('completionOf', () => {
  it('is the fraction heard', () => {
    expect(completionOf({ seconds: 60, duration: 240 })).toBeCloseTo(0.25);
  });

  it('is zero for something with no length, rather than infinite', () => {
    // Live radio. A stream has no proportion to be through.
    expect(completionOf({ seconds: 3600, duration: 0 })).toBe(0);
  });

  it('cannot exceed one, however far back the listener seeked', () => {
    expect(completionOf({ seconds: 900, duration: 240 })).toBe(1);
  });
});

describe('isRejection', () => {
  it('counts an early skip the listener chose', () => {
    expect(isRejection(event({ ending: 'skipped', seconds: 30, duration: 240 }))).toBe(true);
  });

  it('does not count a track that simply ended', () => {
    expect(isRejection(event({ ending: 'finished', seconds: 240 }))).toBe(false);
  });

  /**
   * The distinction the whole type exists for. A dropped stream is not a
   * dislike, and counting it as one teaches the app that a bad connection is
   * an opinion.
   */
  it('does not count an interruption as an opinion', () => {
    expect(isRejection(event({ ending: 'interrupted', seconds: 12, duration: 240 }))).toBe(false);
  });

  it('does not count a skip past the halfway mark', () => {
    // Moving on from a track you have heard is not rejecting it.
    expect(isRejection(event({ ending: 'skipped', seconds: 130, duration: 240 }))).toBe(false);
  });

  /**
   * Scrubbing through a queue looking for something hits the first seconds of
   * several tracks. Counting those would mark the front of every album as
   * disliked.
   */
  it('ignores the first few seconds, which are how people search a queue', () => {
    expect(isRejection(event({ ending: 'skipped', seconds: 3, duration: 240 }))).toBe(false);
  });
});

describe('countsAsPlay', () => {
  it('agrees with the scrobble threshold at half a track', () => {
    expect(countsAsPlay(event({ seconds: 119, duration: 240 }))).toBe(false);
    expect(countsAsPlay(event({ seconds: 120, duration: 240 }))).toBe(true);
  });

  it('caps the threshold at four minutes for something long', () => {
    // An hour-long mix counts once four minutes are in, as Last.fm has it.
    expect(countsAsPlay(event({ seconds: 241, duration: 3600 }))).toBe(true);
  });

  it('falls back to four minutes when the length is unknown', () => {
    expect(countsAsPlay(event({ seconds: 100, duration: 0 }))).toBe(false);
    expect(countsAsPlay(event({ seconds: 300, duration: 0 }))).toBe(true);
  });
});

describe('sessionFor', () => {
  const previous = event({ at: 1_000_000, session: 4 });

  it('starts at one when there is no history', () => {
    expect(sessionFor(1_000_000, undefined)).toBe(1);
  });

  it('stays in the sitting across a short gap', () => {
    expect(sessionFor(previous.at + SESSION_GAP_MS - 1, previous)).toBe(4);
  });

  it('opens a new sitting past the gap', () => {
    expect(sessionFor(previous.at + SESSION_GAP_MS + 1, previous)).toBe(5);
  });

  /**
   * A device whose clock jumped backwards would otherwise mint a session per
   * event while the time settled, and every co-occurrence edge in that stretch
   * would be lost — pairs never cross a session boundary.
   */
  it('does not mint sessions when the clock goes backwards', () => {
    expect(sessionFor(previous.at - 60_000, previous)).toBe(4);
  });
});

describe('endingFrom', () => {
  it('calls a track that reached its end finished', () => {
    expect(endingFrom(240, 240)).toBe('finished');
  });

  /**
   * The reported position is the last frame rendered, and gapless trimming,
   * encoder padding and the crossfade each take a slice off it. An exact
   * comparison would file almost every completed track as a skip, and the
   * skip signal is the one that must not cry wolf.
   */
  it('allows for the seconds trimming and crossfade take off the end', () => {
    expect(endingFrom(240 - FINISHED_SLACK_SECONDS, 240)).toBe('finished');
  });

  it('calls an early exit a skip', () => {
    expect(endingFrom(30, 240)).toBe('skipped');
  });

  it('treats something with no length as a skip, never as finished', () => {
    // Live radio does not end, so it cannot have been played to the end.
    expect(endingFrom(3600, 0)).toBe('skipped');
  });
});
