import type { Artist } from "@/domain/entities/Artist";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapArtist } from "../mapArtist";
import { SubsonicResponse } from "../types";

export type GetArtistResult = Artist | null;

export async function getArtist(
  client: NavidromeClient,
  artistId: string,
  provenance: Provenance
): Promise<GetArtistResult> {
  const raw = await client.request<SubsonicResponse>("getArtist.view", { id: artistId });
  const artist = raw?.["subsonic-response"]?.artist;
  if (!artist) return null;

  return mapArtist(artist, provenance);
}
