import type { Provenance } from '@/domain/identity/Provenance';
import { provenanceScope } from '@/domain/identity/Provenance';

/** Anything the log can be keyed by: it needs an id and where it came from. */
interface Identified {
  nativeId: string;
  provenance: Provenance;
}

/**
 * The one name a thing goes by in the listening log.
 *
 * There has to be exactly one of these, and it has to be shared by the code
 * that *writes* the log and the code that *reads* it, because a mismatch here
 * is completely silent. Nothing throws, nothing fails a type check, and no
 * test that mocks one side of it notices — the model simply looks up keys that
 * are not there, finds nothing about anybody, and returns every list in the
 * order it arrived. Working code that accomplishes nothing, which is the shape
 * this codebase documents most and the shape it just produced: the autoplay
 * coordinator was briefly keyed by `localId` while the log was keyed by
 * `serverId:nativeId`, and all four gates passed.
 *
 * `serverId:nativeId` rather than `localId`, which also carries provenance and
 * would have been the tidier choice. Two reasons it is not: the counters this
 * log replaced were keyed this way, so the migration that carries years of
 * history across speaks it, and `statsSelectors` splits the prefix back off to
 * answer per-entity questions. Changing the format would mean changing both,
 * for no gain over a shared function.
 */
function listenerKey(serverId: string, nativeId: string): string {
  return `${serverId}:${nativeId}`;
}

/** The key for a song, album or artist, from the provenance it carries. */
export function entityKey(entity: Identified): string {
  return listenerKey(provenanceScope(entity.provenance), entity.nativeId);
}

/**
 * The key for something that came with a song — its album, artist, or the
 * playlist it was reached through.
 *
 * From the *song's* provenance, not from whichever server happens to be
 * active. A track from one server does not become another server's track
 * because the listener switched; keying its album off the active server would
 * file the same album under two names across a switch, and split its history
 * in half at the moment somebody most wants it whole.
 */
export function relatedKey(
  song: Pick<Identified, 'provenance'>,
  nativeId: string | undefined,
): string | undefined {
  return nativeId ? listenerKey(provenanceScope(song.provenance), nativeId) : undefined;
}
