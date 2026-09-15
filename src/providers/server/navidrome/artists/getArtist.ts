import type { Artist } from "@/domain/entities/Artist";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapArtist } from "../mapArtist";
import { SubsonicResponse } from "../types";

type GetArtistResult = Artist | null;

/**
 * Navidrome's own biography, as plain text. It arrives from whichever agent
 * found one (Deezer needs no key), sometimes with a trailing "Read more on
 * Last.fm" link that reads as noise once the markup is gone.
 */
export function plainBiography(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const text = raw
    .replace(/<a\s[^>]*>[^<]*<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  return text || undefined;
}

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

/**
 * One artist, with the biography Navidrome already fetched for it — for the
 * artist page, which shows one. (An album lookup only wants the artist's
 * picture and uses `getArtist`.)
 *
 * `getArtist` carries no biography; `getArtistInfo2` does, and asking for it
 * is what keeps the app from sending the artist to Last.fm for a bio the
 * server has. The info call is best-effort — an artist without one is still
 * an artist.
 */
export async function getArtistWithBiography(
  client: NavidromeClient,
  artistId: string,
  provenance: Provenance
): Promise<GetArtistResult> {
  const [artist, info] = await Promise.all([
    getArtist(client, artistId, provenance),
    client
      .request<SubsonicResponse>("getArtistInfo2.view", { id: artistId, count: 0 })
      .catch(() => null),
  ]);
  if (!artist) return null;

  const biography = plainBiography(info?.["subsonic-response"]?.artistInfo2?.biography);
  return biography ? { ...artist, biography } : artist;
}
