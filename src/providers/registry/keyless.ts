/**
 * The integrations that need nothing injected to be usable.
 *
 * Keyless public APIs: no client, no credentials, no server URL, so they can
 * be handed to the broker as declarations rather than built per call.
 *
 * These are every provider the broker serves today. The jobs a credentialed
 * integration does — scrobbling, downloading, AudioMuse's queue fill and
 * playlists — are owned by the features that do them (`features/playback`,
 * `features/downloaders`, `features/audiomuse`), not by a capability, because
 * each has exactly one provider and behaviour a shared contract would have to
 * invent. See the note at the top of `contracts/Capabilities.ts`.
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
