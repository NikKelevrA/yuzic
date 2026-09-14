import type { Server } from '@/types/Server';
import type { Provenance } from '@/domain/identity/Provenance';
import { plexBasicAuthHeader } from '@/providers/server/plex/client';

/**
 * The ephemeral request headers a track needs to be fetched, kept off the URL
 * and off any persisted Song/queue/cache. Audio and artwork are separate
 * fields because the engine fetches cover art independently of the stream and
 * wires each to a distinct `Track` field — see `mediaItem.ts` and the engine's
 * `Track.headers` / `Track.artworkHeaders`.
 */
export interface RequestHeaders {
  headers?: Record<string, string>;
  artworkHeaders?: Record<string, string>;
}

const EMPTY: RequestHeaders = {};

/**
 * Headers for one song against the active server.
 *
 * Only a Plex server with Basic auth configured returns anything: those sit
 * behind a reverse proxy that authenticates every request — the stream and the
 * artwork alike — with `Authorization: Basic`, and a signed-URL/token provider
 * (Navidrome, Jellyfin, Emby, a token-only Plex) must be left untouched. The
 * same header value covers both fetches, but is handed back under the two
 * distinct fields so the engine wires them independently.
 *
 * A song already resolved to a local `file://` path needs no credentials, so
 * it is skipped even on a Basic-auth Plex server. A song that names a different
 * provider than the active server (a mixed queue) is likewise skipped — its
 * credentials are not the ones we hold.
 *
 * A mixed queue is detected by the track's origin *server id*, not its server
 * type. That is strictly more precise: two Plex servers share a type, and the
 * credentials we hold for one are not the other's. The track's provenance says
 * which server it came from, so nothing has to be duplicated onto it.
 */
export function mediaHeadersForSong(
  server: Server | null | undefined,
  resource: { song?: { provenance?: Provenance }; streamUrl?: string }
): RequestHeaders {
  if (resource.streamUrl?.startsWith('file:')) return EMPTY;
  const provenance = resource.song?.provenance;
  // A track from a different origin than the active server carries none of
  // our credentials; one with no stated origin is assumed to be the active
  // server's, which is what every caller passing a bare URL means.
  if (provenance && (provenance.origin !== 'server' || provenance.serverId !== server?.id)) {
    return EMPTY;
  }
  if (server?.type !== 'plex') return EMPTY;
  const auth = plexBasicAuthHeader(server?.basicAuth);
  if (!auth) return EMPTY;
  return { headers: auth, artworkHeaders: auth };
}
