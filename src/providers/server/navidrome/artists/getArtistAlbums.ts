import type { Album } from "@/domain/entities/Album";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapAlbum } from "../mapAlbum";
import { SubsonicResponse } from "../types";

/**
 * The artist's own releases, straight from getArtist.view's embedded `album`
 * list — the same ID3 shape search3 uses. `getArtist`/`mapArtist` never read
 * this (the synced catalog store is the library's discography index for
 * everything already-owned, and is both cheaper and already proven correct
 * for that), so this is a second, deliberately separate entry point used
 * only as a live fallback for an id the sync has never seen — see
 * `useLiveArtistAlbums`, gated behind virtual-catalog browsing.
 */
export async function getArtistAlbums(
  client: NavidromeClient,
  artistId: string,
  provenance: Provenance
): Promise<Album[]> {
  const raw = await client.request<SubsonicResponse>("getArtist.view", { id: artistId });
  const albums = raw?.["subsonic-response"]?.artist?.album ?? [];
  return albums.map(dto => mapAlbum(dto, { provenance }));
}
