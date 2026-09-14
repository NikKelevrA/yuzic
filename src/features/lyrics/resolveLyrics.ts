import type { LyricsResult } from "@/providers/contracts/ServerAdapter";
import type { SourceId } from "@/providers/registry/sources";

/** An outside source that can provide lyrics, as `providers/registry/sources` declares it. */
export type ExternalLyricsSourceId = SourceId;

/** Enough about the current song for an external source to look itself up. */
export type LyricsSongInfo = {
  songId: string;
  title: string;
  artist: string;
  album?: string;
  /** Seconds. LRCLIB uses this to disambiguate same-named tracks. */
  durationSec?: number;
};

type ExternalLyricsFetcher = (song: LyricsSongInfo) => Promise<LyricsResult | null>;

/** One fetcher per source id. A second lyrics source is an entry in
 *  `providers/registry/lyricsFetchers` and a use in `providers/registry/sources`
 *  — nothing in this file changes. */
export type ExternalLyricsFetchers = Partial<Record<ExternalLyricsSourceId, ExternalLyricsFetcher>>;

type ResolveLyricsInput = {
  song: LyricsSongInfo;
  /** The server-embedded lookup — always tried first, unconditionally. */
  getServerLyrics: (songId: string) => Promise<LyricsResult | null>;
  /** The user's fallback order, enabled sources only, most-preferred first.
   *  Disabled sources are simply absent from this list — there is no
   *  separate enabled/disabled bit to reconcile against the order here. */
  enabledExternalSourcesInOrder: ExternalLyricsSourceId[];
  fetchers: ExternalLyricsFetchers;
};

/**
 * Server-embedded lyrics first, then each enabled external source in the
 * user's chosen order, stopping at the first non-empty result.
 *
 * When `enabledExternalSourcesInOrder` is empty — the default, since every
 * external source ships off — this behaves exactly like the bare
 * `api.lyrics.getBySongId()` call it replaces: server-only, no external
 * network calls at all.
 */
export async function resolveLyrics(input: ResolveLyricsInput): Promise<LyricsResult | null> {
  const { song, getServerLyrics, enabledExternalSourcesInOrder, fetchers } = input;

  const serverResult = await getServerLyrics(song.songId);
  if (serverResult && serverResult.lines.length > 0) {
    return serverResult;
  }

  for (const sourceId of enabledExternalSourcesInOrder) {
    const fetcher = fetchers[sourceId];
    if (!fetcher) continue;

    const result = await fetcher(song);
    if (result && result.lines.length > 0) {
      return result;
    }
  }

  return null;
}
