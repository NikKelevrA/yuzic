import {
  settleFromBar,
  settleFromPlayer,
  OPEN_AT,
  OPEN_VELOCITY,
  CLOSE_BELOW,
  CLOSE_VELOCITY,
} from './settle';

describe('settleFromBar', () => {
  it('opens when the drag passes the threshold', () => {
    expect(settleFromBar(OPEN_AT + 0.01, 0, true)).toBe(1);
  });

  it('falls back to the dock when it does not', () => {
    expect(settleFromBar(OPEN_AT - 0.01, 0, true)).toBe(0);
  });

  it('takes a fast upward flick that never travelled far', () => {
    expect(settleFromBar(0.05, OPEN_VELOCITY - 1, true)).toBe(1);
  });

  it('ignores a downward flick, which is not an open', () => {
    expect(settleFromBar(0.05, 2000, true)).toBe(0);
  });
});

describe('settleFromPlayer', () => {
  it('stays open when barely pulled down', () => {
    expect(settleFromPlayer(CLOSE_BELOW + 0.01, 0, true)).toBe(1);
  });

  it('closes once pulled past the threshold', () => {
    expect(settleFromPlayer(CLOSE_BELOW - 0.01, 0, true)).toBe(0);
  });

  it('takes a decisive throw downward from near the top', () => {
    expect(settleFromPlayer(0.99, CLOSE_VELOCITY + 1, true)).toBe(0);
  });

  it('ignores an upward flick, which cannot close', () => {
    expect(settleFromPlayer(0.99, -2000, true)).toBe(1);
  });
});

describe('a gesture that never moved the player', () => {
  // The pans begin on every touch, taps included, and finalize on every
  // release. They used to answer "nearest end" for a gesture that never moved:
  // a tap on the bar calls `expand()`, the spring has barely left 0 when the pan
  // finalizes, the nearest end is 0 — and a second spring sent the player
  // straight back into the dock. A quick tap never opened the player; the close
  // chevron raced the same way in reverse. The tap is the pressable's, so an
  // unmoved release decides nothing and must not write `expansion`.
  it('leaves the open to the press on the bar', () => {
    for (const e of [0, 0.02, 0.1, 0.4]) {
      expect(settleFromBar(e, 0, false)).toBeNull();
    }
  });

  it('leaves the close to the chevron on the player', () => {
    for (const e of [1, 0.98, 0.9, 0.6]) {
      expect(settleFromPlayer(e, 0, false)).toBeNull();
    }
  });
});

describe('every outcome is an end', () => {
  // The bug (#211): the close gesture returned early without settling when the
  // player was fully open, so an interrupted pan left `expansion` wherever it
  // stood — and the playing bar, which fades itself out by `expansion`, drew
  // fully transparent while still mounted and still counted as open. Any drag
  // that wrote `expansion` has to send it to 0 or 1.
  it('never returns an intermediate for a drag that moved, whatever it is given', () => {
    const values = [0, 0.001, 0.15, 0.3, 0.49, 0.5, 0.74, 0.75, 0.99, 1];
    const velocities = [-2000, -700, -100, 0, 100, 700, 2000];
    for (const e of values) {
      for (const v of velocities) {
        expect([0, 1]).toContain(settleFromBar(e, v, true));
        expect([0, 1]).toContain(settleFromPlayer(e, v, true));
      }
    }
  });
});
