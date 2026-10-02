import type { NavidromeClient } from "../client";
import { SubsonicResponse } from "../types";

interface GetAlbumInfoResult {
  notes: string;
  musicBrainzId: string | null;
  lastFmUrl: string | null;
}

function normalizeGetAlbumInfo(raw: SubsonicResponse): GetAlbumInfoResult {
  const info = raw?.["subsonic-response"]?.albumInfo ?? {};
  return {
    notes: info.notes ?? "",
    musicBrainzId: info.musicBrainzId ?? null,
    lastFmUrl: info.lastFmUrl ?? null,
  };
}

const NO_INFO: GetAlbumInfoResult = { notes: "", musicBrainzId: null, lastFmUrl: null };

/**
 * Last.fm-backed enrichment layered on top of the tag-derived getAlbum
 * response — best-effort, same spirit as `getArtistWithBiography`'s own info
 * call. An album the server doesn't recognize (not yet synced, such as a
 * self-hosted catalog bridge's virtual entry) can error this endpoint
 * outright rather than return an empty body, which used to take the whole
 * `getAlbum` call down with it over a field nothing requires.
 */
export async function getAlbumInfo(
  client: NavidromeClient,
  albumId: string
): Promise<GetAlbumInfoResult> {
  const raw = await client
    .request<SubsonicResponse>("getAlbumInfo.view", { id: albumId })
    .catch(() => null);
  return raw ? normalizeGetAlbumInfo(raw) : NO_INFO;
}
