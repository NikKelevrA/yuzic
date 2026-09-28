import type { SourceId } from './sources';
import { parseServerAddress } from './sources';
import { musicbrainzServerAnswers } from './musicbrainz';

/** Not exported: callers read the result of `checkServerAddress`, and an
 *  export nothing imports is one the architecture gate rightly refuses. */
type ServerAddressCheck =
  | { ok: true; address: string }
  | { ok: false; reason: 'invalid' | 'unreachable' };

/** How each self-hostable source asks a server whether it is one of its own. */
const ANSWERS: Partial<Record<SourceId, (address: string) => Promise<boolean>>> = {
  musicbrainz: musicbrainzServerAnswers,
};

/**
 * Whether an address typed for a source's own server is worth saving: shaped
 * like a web address, and answering like that source's server does.
 *
 * Asked before saving, so a typo or a server that is not running is said so
 * beside the field, rather than showing up later as a search that quietly
 * finds nothing.
 */
export async function checkServerAddress(source: SourceId, input: string): Promise<ServerAddressCheck> {
  const address = parseServerAddress(input);
  if (!address) return { ok: false, reason: 'invalid' };
  const answers = ANSWERS[source];
  if (answers && !(await answers(address))) return { ok: false, reason: 'unreachable' };
  return { ok: true, address };
}

/** Not exported for the same reason as {@link ServerAddressCheck}. */
type PairedServerAddressCheck =
  | { ok: true; address: string; fallbackAddress?: string }
  | { ok: false; reason: 'invalid'; field: 'primary' | 'fallback' }
  | { ok: false; reason: 'unreachable' };

/**
 * Whether a primary address, plus an optional fallback for it, are worth
 * saving together.
 *
 * The primary is required and must be shaped like a web address; the
 * fallback, if given at all, must be too. Reachability is not required of
 * both individually — only that *one* of them answers, checked primary
 * first, then fallback. That's the actual fix for the setup-time version of
 * this bug: a primary address that only resolves over a VPN you happen not
 * to be on right now (Tailscale, say) used to block saving outright just
 * because it was checked alone and first. With a fallback on hand that does
 * answer, saving no longer depends on which of the two happens to work at
 * the moment you hit save — and once saved, the same "try primary, then
 * fallback" order is what a live request does too (see
 * `currentMusicbrainzClient` in `./musicbrainz`), so the address that saved
 * the setup keeps working as a real fallback afterward, not just this once.
 */
export async function checkServerAddressWithFallback(
  source: SourceId,
  primaryInput: string,
  fallbackInput: string
): Promise<PairedServerAddressCheck> {
  const address = parseServerAddress(primaryInput);
  if (!address) return { ok: false, reason: 'invalid', field: 'primary' };

  const trimmedFallback = fallbackInput.trim();
  const fallbackAddress = trimmedFallback ? parseServerAddress(trimmedFallback) : null;
  if (trimmedFallback && !fallbackAddress) return { ok: false, reason: 'invalid', field: 'fallback' };

  const answers = ANSWERS[source];
  if (!answers) return { ok: true, address, fallbackAddress: fallbackAddress ?? undefined };

  if (await answers(address)) return { ok: true, address, fallbackAddress: fallbackAddress ?? undefined };
  if (fallbackAddress && (await answers(fallbackAddress))) {
    return { ok: true, address, fallbackAddress };
  }
  return { ok: false, reason: 'unreachable' };
}
