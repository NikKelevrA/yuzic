import type { PlaylistDetail } from "@/domain/entities/Detail";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { mapPlaylist } from "../mapPlaylist";
import { mapSong } from "../mapSong";
import { SubsonicResponse } from "../types";

export type GetPlaylistResult = PlaylistDetail | null;

export async function getPlaylist(
  client: NavidromeClient,
  playlistId: string,
  provenance: Provenance
): Promise<GetPlaylistResult> {
  const raw = await client.request<SubsonicResponse>("getPlaylist.view", { id: playlistId });
  const playlist = raw?.["subsonic-response"]?.playlist;
  if (!playlist) return null;

  const entries = playlist.entry ?? [];
  const songs = entries
    .filter((s): s is typeof s & { id: string } => !!s?.id)
    .map((s) => mapSong(s, { provenance }));

  return {
    // Songs are mapped first so their localIds can be threaded into the
    // playlist's songIds — the two must agree, per PlaylistDetail's contract.
    playlist: mapPlaylist(playlist, { provenance, songIds: songs.map((s) => s.localId) }),
    songs,
  };
}
