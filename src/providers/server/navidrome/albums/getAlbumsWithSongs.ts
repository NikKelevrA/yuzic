import type { AlbumDetail } from "@/domain/entities/Detail";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { getAlbumList } from "./getAlbumList";
import { albumCoverOf, mapAlbum } from "../mapAlbum";
import { mapAlbumSongs } from "./mapAlbumSongs";
import { SubsonicResponse } from "../types";

const BATCH_SIZE = 15;

export async function getAlbumsWithSongs(
  client: NavidromeClient,
  provenance: Provenance
): Promise<AlbumDetail[]> {
  const albumList = await getAlbumList(client, provenance, "alphabeticalByName");
  if (albumList.length === 0) return [];

  const results: AlbumDetail[] = [];

  for (let i = 0; i < albumList.length; i += BATCH_SIZE) {
    const batch = albumList.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((a) => client.request<SubsonicResponse>("getAlbum.view", { id: a.nativeId }))
    );

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;

      const raw = result.value?.["subsonic-response"]?.album;
      if (!raw) continue;

      const cover = albumCoverOf(raw);
      // The full ID3 payload from this batched getAlbum.view call is used
      // directly rather than the summary entry from the list — it carries
      // everything the summary does plus the track list.
      const songs = mapAlbumSongs(raw, cover, provenance);
      const album = mapAlbum(raw, { provenance, songIds: songs.map((s) => s.localId) });

      results.push({ album, songs });
    }
  }

  return results;
}
