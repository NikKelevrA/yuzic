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
