/**
 * True for an id a self-hosted catalog bridge (e.g. MusicBridge, sitting in
 * front of Navidrome) mints for MusicBrainz content it mixes into the active
 * server's own Subsonic responses for not-yet-downloaded artists/albums/songs
 * — `mb-artist-<artist-mbid>`, `mb-rg-<release-group-mbid>`, and bare
 * `mb-<recording-mbid>` for songs. All three shapes share the one prefix, so
 * a plain `startsWith` covers every case.
 *
 * A real server-native id never collides with this: Navidrome's own ids are
 * plain base62 hashes with no fixed prefix, so seeing `mb-` is unambiguous
 * proof the entry came from a catalog bridge rather than the server's own
 * library.
 */
export function isVirtualCatalogId(id: string): boolean {
  return id.startsWith('mb-');
}
