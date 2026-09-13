/**
 * The integrations that need nothing injected to be usable.
 *
 * Keyless public APIs: no client, no credentials, no server URL, so they can
 * be handed to the broker as declarations rather than built per call.
 *
 * Its own module rather than part of the registry barrel, because the barrel
 * re-exports every provider — including ones whose module graph reaches native
 * configuration — and a feature that only wants to search a catalogue should
 * not drag all of that in behind it.
 */
import type { Provider } from '../contracts/Provider';
import { deezerProvider } from './deezer';
import { musicbrainzProvider } from './musicbrainz';
import { lastfmProvider } from './lastfm';
import { lrclibProvider } from './lrclib';

export const KEYLESS_INTEGRATIONS: readonly Provider[] = [
  deezerProvider,
  musicbrainzProvider,
  lastfmProvider,
  lrclibProvider,
];
