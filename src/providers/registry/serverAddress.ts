import type { SourceId } from './sources';
import { parseServerAddress } from './sources';
import { musicbrainzServerAnswers } from './musicbrainz';

export type ServerAddressCheck =
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
