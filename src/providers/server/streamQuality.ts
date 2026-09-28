import type { AudioQuality, PreferredCodec } from '@/domain/playback/AudioFormat';

type StreamParams = {
  format: PreferredCodec | 'raw';
  maxBitRate?: number;
};

/**
 * What to ask the server for at a given quality, in the codec the listener
 * prefers.
 *
 * The codec used to be `mp3` outright, which meant a server with an Opus
 * profile — Navidrome ships one, and downsamples to Opus by default — was
 * told to produce MP3 anyway. Opus is better than MP3 at the same bitrate, so
 * the ceiling below buys less than it should.
 *
 * `original` takes no codec: it is the untouched file, which is the one
 * request that is not a transcode.
 */
export function qualityToStreamParams(
  quality: AudioQuality,
  codec: PreferredCodec = 'mp3',
): StreamParams {
  switch (quality) {
    case 'low':      return { format: codec, maxBitRate: 128 };
    case 'medium':   return { format: codec, maxBitRate: 192 };
    case 'high':     return { format: codec, maxBitRate: 320 };
    case 'original': return { format: 'raw' };
  }
}
