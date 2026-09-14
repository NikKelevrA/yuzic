import type { LyricsResult } from "@/providers/contracts/ServerAdapter";
import type { SourceId } from "@/providers/registry/sources";
import { offersFor, type BrokerInput } from "@/providers/registry/capabilityBroker";
import { resolved, type ResolvedField } from "@/domain/entities/ResolvedField";
import { provenanceScope } from "@/domain/identity/Provenance";
import type { Lyrics } from "@/providers/contracts/Capabilities";
import type { Song } from "@/domain/entities/Song";

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

/**
 * The Phase 5 (capability-broker, attributed) shape of lyrics resolution.
 *
 * `resolveLyrics` above stays exactly as it is: it is the contract
 * `src/features/player/PlayingScreen.tsx` calls today, fetcher-injected rather than
 * broker-mediated, and that screen is out of this phase's file scope to
 * migrate — replacing its call site is not something this change can do
 * without breaking a shipping feature (gate 4). This function coexists
 * alongside it for a caller that wants the broker-mediated, attributed
 * contract the rest of Phase 5 (`resolveArtistDetails`, `resolveAlbumDetails`)
 * uses: the origin's own lyrics are authoritative and short-circuit every
 * provider call; a miss falls through to `lyrics`-capable offers in the
 * broker's order, first hit wins, attributed via `ResolvedField`.
 *
 * A caller building a React Query key for this should include the song's
 * identity, the `'lyrics'` capability name, and the ordered policy
 * (`broker.order`) — same requirement as the artist/album resolvers.
 */
export interface ResolveLyricsAttributedInput {
  song: Song;
  /** The origin's own lookup — always tried first, unconditionally, and
   *  authoritative when it answers. */
  getServerLyrics: (songId: string) => Promise<Lyrics | null>;
  /** `lyrics`-capable integrations, enumerated and ordered by the broker —
   *  never named directly here. */
  broker: BrokerInput;
}

const hasLyricLines = (lyrics: Lyrics | null | undefined): lyrics is Lyrics =>
  !!lyrics && lyrics.lines.length > 0;

export async function resolveLyricsAttributed(
  input: ResolveLyricsAttributedInput
): Promise<ResolvedField<Lyrics> | null> {
  const { song, getServerLyrics, broker } = input;

  const serverResult = await getServerLyrics(song.nativeId);
  if (hasLyricLines(serverResult)) {
    return resolved(serverResult, provenanceScope(song.provenance));
  }

  for (const offer of offersFor(broker, "lyrics")) {
    const result = await offer.invoke(song);
    if (hasLyricLines(result)) {
      return resolved(result, offer.providerId);
    }
  }

  return null;
}
