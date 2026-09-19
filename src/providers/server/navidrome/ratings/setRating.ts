import type { NavidromeClient } from "../client";
import { SubsonicResponse } from "../types";

/**
 * Writes a five-star rating for a song, album or artist.
 *
 * One id parameter for all three, unlike `star.view` next door, which picks
 * the entity kind by which parameter name it is given — `setRating.view` is
 * the older endpoint and takes plain `id`.
 *
 * Rating 0 is how Subsonic clears one; there is no separate unrate call.
 */
export async function setRating(
  client: NavidromeClient,
  id: string,
  rating: number
): Promise<void> {
  const raw = await client.request<SubsonicResponse>("setRating.view", {
    id,
    rating: String(rating),
  });
  const status = raw?.["subsonic-response"]?.status;
  if (status !== "ok") {
    throw new Error("Server refused the rating.");
  }
}
