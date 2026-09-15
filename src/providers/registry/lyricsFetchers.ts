import { getLyrics as getLrclibLyrics } from '@/providers/integration/lrclib';
import type { ExternalLyricsFetchers } from '@/features/lyrics/resolveLyrics';

/**
 * The network-backed lyrics fetcher for each outside source that has one,
 * declared here with the other provider declarations. `resolveLyrics` takes
 * these injected, so tests pass fakes instead.
 */
export const externalLyricsFetchers: ExternalLyricsFetchers = {
  lrclib: song =>
    getLrclibLyrics({
      artist: song.artist,
      title: song.title,
      album: song.album,
      durationSec: song.durationSec,
    }),
};
