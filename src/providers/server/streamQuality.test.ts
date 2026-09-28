import { qualityToStreamParams } from './streamQuality';
import { createNavidromeClient } from './navidrome/client';

/**
 * Playback quality is a setting that has to change what is actually requested
 * from the server, not just what Redux holds.
 */
describe('stream quality reaches the stream request', () => {
  it('maps each quality to a transcode ceiling, and original to the untouched file', () => {
    expect(qualityToStreamParams('low')).toEqual({ format: 'mp3', maxBitRate: 128 });
    expect(qualityToStreamParams('medium')).toEqual({ format: 'mp3', maxBitRate: 192 });
    expect(qualityToStreamParams('high')).toEqual({ format: 'mp3', maxBitRate: 320 });
    expect(qualityToStreamParams('original')).toEqual({ format: 'raw' });
  });

  // Navidrome ships an Opus profile and downsamples to Opus by default; it was
  // told MP3 regardless, so the bitrate ceiling bought less than it could.
  it('asks for the codec the listener prefers, at the same ceiling', () => {
    expect(qualityToStreamParams('medium', 'opus')).toEqual({ format: 'opus', maxBitRate: 192 });
    expect(qualityToStreamParams('high', 'opus')).toEqual({ format: 'opus', maxBitRate: 320 });
  });

  // The untouched file is the one request that is not a transcode.
  it('ignores the codec for original, which is not a transcode', () => {
    expect(qualityToStreamParams('original', 'opus')).toEqual({ format: 'raw' });
  });

  it('still asks for mp3 when nothing else was chosen', () => {
    expect(qualityToStreamParams('high')).toEqual({ format: 'mp3', maxBitRate: 320 });
  });

  it('carries the codec into the URL a server client builds', () => {
    const client = createNavidromeClient({ serverUrl: 'https://music.example.com', username: 'u', password: 'p' });

    const opus = new URL(client.buildStreamUrl('song-1', 'medium', 'opus')).searchParams;
    expect(opus.get('format')).toBe('opus');
    expect(opus.get('maxBitRate')).toBe('192');
  });

  it('changes the URL a server client builds', () => {
    const client = createNavidromeClient({ serverUrl: 'https://music.example.com', username: 'u', password: 'p' });

    const low = new URL(client.buildStreamUrl('song-1', 'low')).searchParams;
    expect(low.get('format')).toBe('mp3');
    expect(low.get('maxBitRate')).toBe('128');

    const original = new URL(client.buildStreamUrl('song-1', 'original')).searchParams;
    expect(original.get('format')).toBe('raw');
    // Negative control: the untouched file carries no transcode ceiling.
    expect(original.get('maxBitRate')).toBeNull();
  });
});
