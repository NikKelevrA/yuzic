import {
  finishListen,
  latchListen,
  listenedSoFar,
  observePosition,
  observeSeek,
  resetListen,
  takeFinishedListen,
} from './listenMeter'

/**
 * `ListenEvent.seconds` was documented as listened time and delivered a
 * playhead by every producer in the app. These pin the difference, because the
 * difference is the whole reason this module exists: the two numbers agree
 * exactly until somebody seeks backwards, and every test below is a case where
 * they do not.
 */
describe('listenMeter', () => {
  // The meter is a module singleton, like the backend it measures. Starting a
  // fresh listen is the production way to clear it.
  beforeEach(() => { resetListen() })

  it('credits ordinary playback between observations', () => {
    observePosition(0)
    observePosition(10)
    observePosition(20)

    expect(listenedSoFar(20)).toBe(20)
  })

  it('counts a re-listen after a rewind, which a playhead cannot', () => {
    observePosition(0)
    observePosition(10)
    observeSeek(10, 0)
    observePosition(10)

    // Ten seconds heard twice is twenty seconds heard, against a playhead of
    // ten. This is the listener a position-based threshold under-counts.
    expect(listenedSoFar(10)).toBe(20)
  })

  it('credits nothing for a forward seek', () => {
    observePosition(0)
    observePosition(10)
    observeSeek(10, 200)

    // Scrubbing to the end is not listening to the middle.
    expect(listenedSoFar(200)).toBe(10)
  })

  it('re-anchors rather than crediting a jump it did not see', () => {
    observePosition(0)
    observePosition(10)
    // Nobody told the meter about this one — a lock-screen scrubber, say. The
    // gap is too large to be playback, so it buys nothing.
    observePosition(600)
    observePosition(605)

    expect(listenedSoFar(605)).toBe(15)
  })

  it('treats a backward jump it did not see as a seek, not as negative time', () => {
    observePosition(0)
    observePosition(10)
    observePosition(2)

    expect(listenedSoFar(2)).toBeGreaterThanOrEqual(10)
  })

  it('stands still while playback does', () => {
    observePosition(0)
    observePosition(10)
    // The heartbeat keeps ticking while paused so the server hears about the
    // pause. A position that has not moved must not earn anything.
    observePosition(10)
    observePosition(10)

    expect(listenedSoFar(10)).toBe(10)
  })

  it('hands the closed total to whoever asks for it, once', () => {
    observePosition(0)
    observePosition(10)
    observeSeek(10, 0)
    observePosition(10)
    finishListen('song-1', 10)

    expect(takeFinishedListen('song-1')).toBe(20)
    // Consumed, so a departure reported twice cannot be credited twice here
    // either.
    expect(takeFinishedListen('song-1')).toBeNull()
  })

  it('returns null for a departure it never measured', () => {
    // The signal to fall back to the playhead. Returning zero here would turn
    // an unwired path into "nothing was ever listened to", which is how a
    // refinement becomes a regression.
    expect(takeFinishedListen('never-seen')).toBeNull()
  })

  it('starts the next listen from nothing', () => {
    observePosition(0)
    observePosition(10)
    finishListen('song-1', 10)

    observePosition(0)
    observePosition(5)

    expect(listenedSoFar(5)).toBe(5)
  })

  it('does not carry one track total into another', () => {
    observePosition(0)
    observePosition(10)
    finishListen('song-1', 10)
    observePosition(0)
    observePosition(3)
    finishListen('song-2', 3)

    expect(takeFinishedListen('song-1')).toBe(10)
    expect(takeFinishedListen('song-2')).toBe(3)
  })

  it('accepts a total measured by a process that is gone', () => {
    // The checkpoint replay: the run of the app that did the measuring was
    // killed, and its number arrives through the same reader as any other.
    latchListen('song-1', 137)

    expect(takeFinishedListen('song-1')).toBe(137)
  })
})
