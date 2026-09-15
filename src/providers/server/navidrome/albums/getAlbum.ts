import type { AlbumDetail } from "@/domain/entities/Detail";
import type { Provenance } from "@/domain/identity/Provenance";
import type { NavidromeClient } from "../client";
import { getAlbumInfo } from "./getAlbumInfo";
import { getArtist } from "../artists/getArtist";
import { mapAlbumSongs } from "./mapAlbumSongs";
import { albumCoverOf, mapAlbum } from "../mapAlbum";
import { SubsonicResponse } from "../types";

type GetAlbumResult = AlbumDetail | null;

export async function getAlbum(
  client: NavidromeClient,
  albumId: string,
  provenance: Provenance
): Promise<GetAlbumResult> {
  const raw = await client.request<SubsonicResponse>("getAlbum.view", { id: albumId });
  const album = raw?.["subsonic-response"]?.album;
  if (!album) return null;

  // getAlbumInfo is Last.fm-backed enrichment Navidrome layers on top of the
  // tag-derived getAlbum response; it only fills the release-group MBID when
  // the album's own ID3 entry didn't already report one.
  // The artist is fetched alongside purely for their artwork: Subsonic's album
  // payload names the artist but carries no cover for them, and an embedded ref
  // with `{ kind: 'none' }` renders as a broken image on the Playing screen's
  // "About the artist" card rather than falling back to the song's cover.
  const [albumInfo, artist] = await Promise.all([
    getAlbumInfo(client, albumId),
    album.artistId ? getArtist(client, album.artistId, provenance) : Promise.resolve(null),
  ]);
  const dtoWithMbid = album.musicBrainzId
    ? album
    : { ...album, musicBrainzId: albumInfo.musicBrainzId ?? undefined };

  const cover = albumCoverOf(dtoWithMbid);

  const songs = mapAlbumSongs(album, cover, provenance);

  return {
    // Songs are mapped first so their localIds can be threaded into the
    // album's songIds — the two must agree, per AlbumDetail's contract.
    album: mapAlbum(dtoWithMbid, {
      provenance,
      songIds: songs.map((s) => s.localId),
      artistCover: artist?.cover,
    }),
    songs,
  };
}
