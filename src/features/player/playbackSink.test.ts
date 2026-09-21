import {
  LOCAL_SINK,
  ownsPlayback,
  type PlaybackSink,
} from './playbackSink';

const dlna: PlaybackSink = { kind: 'dlna', id: 'uuid-1', name: 'Living Room' };
const jukebox: PlaybackSink = { kind: 'jukebox', name: 'Navidrome' };

/**
 * The one distinction the rest of the player depends on: whether the local
 * player is still running. Get this wrong for the jukebox and the phone plays
 * the track a second time, out loud, next to the server that is already
 * playing it.
 */
describe('playback sinks', () => {
  it('hands playback over entirely for the jukebox, and only for it', () => {
    // The local player keeps running for the others: muted for DLNA, as the
    // clock and the queue driver, since a renderer reports no position.
    expect(ownsPlayback(jukebox)).toBe(true);
    expect(ownsPlayback(LOCAL_SINK)).toBe(false);
    expect(ownsPlayback(dlna)).toBe(false);
  });

});
