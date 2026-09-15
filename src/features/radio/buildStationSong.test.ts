import { stationToSong } from './buildStationSong';
import { hasReissuableUrl } from '@/domain/playback/ContentKind';

const station = {
  id: 'st-1',
  name: 'Radio Paradise',
  streamUrl: 'https://stream.radioparadise.com/aac-320',
};

describe('stationToSong', () => {
  it('carries the station endpoint as the stream id, because nothing can rebuild it', () => {
    // A live stream is not reissuable: the URL belongs to the station, not to
    // the user's server. Losing it here means radio silently will not play,
    // because the resolver has nothing to fall back on.
    const song = stationToSong(station, 'server-1');

    expect(song.contentKind).toBe('liveStream');
    expect(hasReissuableUrl(song.contentKind)).toBe(false);
    expect(song.streamId).toBe('https://stream.radioparadise.com/aac-320');
  });

  it('namespaces its identity so a station can never collide with a real track', () => {
    const song = stationToSong(station, 'server-1');

    expect(song.nativeId).toContain('st-1');
    expect(song.nativeId).not.toBe('st-1');
    expect(song.localId).toBe(`local:song:srv:server-1:${song.nativeId}`);
  });

  it('claims no duration, so nothing draws a progress bar against a live stream', () => {
    expect(stationToSong(station, 'server-1').durationSeconds).toBe(0);
  });
});
