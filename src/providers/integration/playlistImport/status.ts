import { createPlaylistImportClient, type PlaylistImportConfig } from './client';

/**
 * `GET /watchlist/playlist-status?target_user=<navidrome_username>` — the
 * interface the NAS watchlist proxy's playlist-import feature exposes for
 * something else to poll (see `nas-followup-prompt.md`, decision 4, and the
 * confirmation that followed it: 382/382 tests passing server-side).
 *
 * The parsing below is deliberately lenient about exact field spelling.
 * `target_user` in the query string is the one name confirmed verbatim; the
 * response body's own shape was described but not pasted as raw JSON, so
 * this accepts a few plausible snake_case spellings for the same fields
 * rather than assuming one. If the real response turns out to use different
 * names, only this file needs to change — everything downstream reads the
 * normalized `PlaylistImportStatus` shape.
 */
export interface PendingPlaylistTrack {
  /** Spotify track id — paired with the playlist id to de-dupe repeat acquisition attempts. */
  spotifyId: string;
  /** Position in the playlist's canonical Spotify order. */
  position: number;
  title: string;
  artist: string;
  /**
   * Past the server's own retry window (14 days, per the addendum brief) —
   * the server has given up resolving this one, and the app shouldn't keep
   * sending it to a downloader either.
   */
  retryExpired: boolean;
}

export interface PlaylistImportStatus {
  /** The Spotify playlist id — stable across reimports, used as the de-dupe key's namespace. */
  playlistId: string;
  navidromePlaylistId: string | null;
  name: string | null;
  pending: PendingPlaylistTrack[];
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function asPosition(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeTrack(raw: unknown): PendingPlaylistTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const spotifyId = asNonEmptyString(r.spotify_id) ?? asNonEmptyString(r.spotifyId) ?? asNonEmptyString(r.id);
  const title = asNonEmptyString(r.title) ?? asNonEmptyString(r.track) ?? asNonEmptyString(r.name);
  const artist = asNonEmptyString(r.artist) ?? asNonEmptyString(r.artist_name) ?? asNonEmptyString(r.artistName);
  // Without an id we can't de-dupe attempts, and without title+artist a
  // downloader has nothing to search for — either missing means this entry
  // can't be acted on, so it's dropped rather than sent through half-formed.
  if (!spotifyId || !title || !artist) return null;
  return {
    spotifyId,
    position: asPosition(r.position ?? r.index),
    title,
    artist,
    retryExpired: r.retry_expired === true || r.retryExpired === true,
  };
}

function normalizePlaylist(raw: unknown): PlaylistImportStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const playlistId = asNonEmptyString(r.spotify_playlist_id)
    ?? asNonEmptyString(r.spotifyPlaylistId)
    ?? asNonEmptyString(r.playlist_id)
    ?? asNonEmptyString(r.id);
  if (!playlistId) return null;

  const pendingRaw = Array.isArray(r.pending_tracks) ? r.pending_tracks
    : Array.isArray(r.pendingTracks) ? r.pendingTracks
    : Array.isArray(r.pending) ? r.pending
    : [];

  const pending = pendingRaw
    .map(normalizeTrack)
    .filter((t): t is PendingPlaylistTrack => t !== null);

  return {
    playlistId,
    navidromePlaylistId: asNonEmptyString(r.navidrome_playlist_id) ?? asNonEmptyString(r.navidromePlaylistId),
    name: asNonEmptyString(r.name) ?? asNonEmptyString(r.playlist_name),
    pending,
  };
}

/** Every import tracked for `targetUser`, each with whatever it's still missing. */
export async function fetchPlaylistStatus(
  config: PlaylistImportConfig,
  targetUser: string
): Promise<PlaylistImportStatus[]> {
  const client = createPlaylistImportClient(config);
  const body = await client.request<unknown>(
    `/watchlist/playlist-status?target_user=${encodeURIComponent(targetUser)}`
  );

  const list = Array.isArray(body)
    ? body
    : (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).playlists))
      ? (body as Record<string, unknown>).playlists as unknown[]
      : [];

  return list
    .map(normalizePlaylist)
    .filter((p): p is PlaylistImportStatus => p !== null);
}
