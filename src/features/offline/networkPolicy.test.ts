import { mayDownloadNow } from './networkPolicy';

describe('mayDownloadNow', () => {
  describe('with the restriction off', () => {
    it('runs on any connection', () => {
      expect(mayDownloadNow({ wifiOnly: false, networkType: 'cellular' })).toBe(true);
      expect(mayDownloadNow({ wifiOnly: false, networkType: 'wifi' })).toBe(true);
      expect(mayDownloadNow({ wifiOnly: false, networkType: 'unknown' })).toBe(true);
    });
  });

  describe('with the restriction on', () => {
    it('holds the queue on cellular', () => {
      // The whole point of the switch: auto-download fires off a library sync,
      // not off a tap, so it can run up a bill nobody asked for.
      expect(mayDownloadNow({ wifiOnly: true, networkType: 'cellular' })).toBe(false);
    });

    it('runs on wifi', () => {
      expect(mayDownloadNow({ wifiOnly: true, networkType: 'wifi' })).toBe(true);
    });

    it('runs when the connection cannot be classified', () => {
      // The decision this file exists to write down. `unknown` is what NetInfo
      // answers on a simulator, on some VPNs, and briefly during any handover.
      // Treating it as "not wifi" would stop every download on those devices
      // with no explanation — the switch says *not on cellular*, so only a
      // connection known to be cellular holds the queue.
      expect(mayDownloadNow({ wifiOnly: true, networkType: 'unknown' })).toBe(true);
    });
  });
});
