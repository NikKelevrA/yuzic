/**
 * Every provider, declared against the `Capabilities` contract (Task 3.3).
 *
 * A server provider is required core — exactly one is active — and is built
 * from that server's already-constructed `ApiAdapter`
 * (`src/providers/registry/serverConnections.ts#createAdapter`). An integration provider
 * is optional and any number may be connected; the keyless ones (Deezer,
 * MusicBrainz, Last.fm, LRCLIB) are plain declarations, and the ones that
 * need the user's own credentials or a client (ListenBrainz, AudioMuse,
 * Lidarr, slskd, SoulSync) are factories.
 *
 * This file is a barrel over the per-provider declarations, split out
 * because each one earns its own file — the amount of provider-specific
 * mapping (DTO -> `Artist`/`Album`, DTO -> capability signature) is exactly
 * the kind of per-provider logic the old registries kept in one file each.
 *
 * See the individual files for what each provider fills and why; see the
 * task report (delivered alongside this change, not as a file in this
 * directory per the no-new-`.md`-files rule) for capabilities deliberately
 * left off, the `serverAdapterSlots`/AudioMuse-special-case reproduction, and
 * the one architecture-gate config change this work depends on that lives
 * outside `src/providers/registry/`.
 */
export {
  createNavidromeProvider,
  createJellyfinProvider,
  createEmbyProvider,
  createPlexProvider,
  createLocalProvider,
} from './servers';

export { deezerProvider } from './deezer';
export { musicbrainzProvider } from './musicbrainz';
export { lastfmProvider } from './lastfm';
export { createListenBrainzProvider } from './listenbrainz';
export { lrclibProvider } from './lrclib';
export { createAudiomuseProvider, type AudiomuseProviderDeps } from './audiomuse';
export { createLidarrProvider } from './lidarr';
export { createSlskdProvider } from './slskd';
export { createSoulSyncProvider } from './soulsync';
