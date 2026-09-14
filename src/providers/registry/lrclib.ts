/**
 * LRCLIB as an integration provider.
 *
 * Anonymous, no API key, no account — the `'none'` auth tier, same as
 * `src/api/lrclib`'s own doc comment says. No client to inject, so this is a
 * plain declaration.
 */
import { getLyrics } from '@/providers/integration/lrclib';
import type { IntegrationProvider } from '../contracts/Provider';

export const lrclibProvider: IntegrationProvider = {
  kind: 'integration',
  id: 'lrclib',
  // No dedicated icon asset exists for LRCLIB today — see the file report.
  presentation: { nameKey: 'settings.sources.lrclib.name', icon: 0 },
  auth: { tier: 'none' },
  capabilities: {
    lyrics: async song => {
      const result = await getLyrics({
        artist: song.artist.name,
        title: song.title,
        album: song.album.title,
        durationSec: song.durationSeconds,
      });
      return result ? { lines: result.lines, synced: result.synced } : null;
    },
  },
  // Keyless public API — LRCLIB being unreachable is handled the same as it
  // having nothing (see `getLyrics`'s own doc comment); reachable by
  // construction the same way Deezer/MusicBrainz are.
  testConnection: async () => ({ ok: true }),
};
