import type { Artist } from "@/domain/entities/Artist";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapArtist } from "../mapArtist";
import { SubsonicResponse } from "../types";

export type GetArtistsResult = Artist[];

export async function getArtists(
  client: NavidromeClient,
  provenance: Provenance
): Promise<GetArtistsResult> {
  const raw = await client.request<SubsonicResponse>("getArtists.view");
  const indexes = raw?.["subsonic-response"]?.artists?.index;
  if (!indexes) return [];
  const flattened = indexes.flatMap((bucket) => bucket.artist ?? []);
  return flattened.map((a) => mapArtist(a, provenance));
}
