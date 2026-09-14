/**
 * The single place that turns "which song" into one canonical `Song`.
 *
 * `CapabilityMap` names no `catalogue.song` capability, so — same reasoning
 * as `artistRepository.ts` — the only origin a song identity can name today
 * is the active server, one call, no fan-out.
 *
 * `src/features/library/matchToLibrary.ts` only adapts the domain matcher
 * for albums and artists; it is out of this feature's file scope to extend,
 * so the song-shaped adapter lives here instead, built directly on
 * `findMatch` — the same primitive `matchToLibrary.ts` itself wraps, and no
 * matching rule beyond what `findMatch` already applies.
 */
import { findMatch } from '@/domain/identity/matching';
import type { Song } from '@/domain/entities/Song';
import type { SongsApi } from '@/providers/contracts/ServerAdapter';

export type SongIdentity = {
  kind: 'server';
  /** The song's id at the active server — `SongsApi.get`'s `id`. */
  nativeId: string;
};

export interface SongRepositoryDeps {
  api: Pick<SongsApi, 'get'>;
  librarySongs: readonly Song[];
}

function matchSongToLibrary(subject: Song, songs: readonly Song[]): Song | null {
  const match = findMatch(
    { externalIds: subject.externalIds, nameKey: { primary: subject.title, secondary: subject.artist.name } },
    songs,
    song => ({ primary: song.title, secondary: song.artist.name })
  );
  return match?.candidate ?? null;
}

/**
 * Fetches one song from its single origin and relates it to the library.
 *
 * Mirrors `artistRepository.getArtist`: the library record wins when the
 * fetched song matches one already loaded, so a caller always gets one
 * canonical `Song` rather than a browsed record and a library record to
 * reconcile itself.
 */
export async function getSong(identity: SongIdentity, deps: SongRepositoryDeps): Promise<Song> {
  const base = await deps.api.get(identity.nativeId);
  if (!base) {
    throw new Error(`Song not found: ${identity.nativeId}`);
  }
  const matched = matchSongToLibrary(base, deps.librarySongs);
  return matched ?? base;
}
