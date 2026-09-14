import type { Song } from '@/domain/entities/Song';
import type { Provenance } from '@/domain/identity/Provenance';
import type { NavidromeClient } from "../client";
import { SubsonicResponse, SubsonicSong } from "../types";
import { getAlbumList } from "../albums/getAlbumList";
import { mapSong } from "../mapSong";

const ALBUM_BATCH_SIZE = 15;

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function getTracksViaSearch(client: NavidromeClient, provenance: Provenance): Promise<Song[]> {
  const PAGE = 500;
  const all = new Map<string, Song>();
  let offset = 0;

  while (true) {
    const data = await client.request<SubsonicResponse>("search3.view", {
      query: "",
      songCount: PAGE,
      songOffset: offset,
      albumCount: 0,
      albumOffset: 0,
      artistCount: 0,
      artistOffset: 0,
    });

    const songs = asArray(data["subsonic-response"]?.searchResult3?.song);
    if (!songs.length) break;

    for (const song of songs) {
      if (!song?.id || all.has(song.id)) continue;
      all.set(song.id, mapSong(song as SubsonicSong & { id: string }, { provenance }));
    }
    if (songs.length < PAGE) break;
    offset += PAGE;
  }

  return [...all.values()];
}

async function getTracksViaAlbumList(client: NavidromeClient, provenance: Provenance): Promise<Song[]> {
  const albums = await getAlbumList(client, provenance, "alphabeticalByName");
  const all = new Map<string, Song>();

  for (let i = 0; i < albums.length; i += ALBUM_BATCH_SIZE) {
    const batch = albums.slice(i, i + ALBUM_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((a) => client.request<SubsonicResponse>("getAlbum.view", { id: a.nativeId }))
    );

    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      const album = result.value?.["subsonic-response"]?.album;
      if (!album) continue;

      for (const song of album.song ?? []) {
        if (!song?.id || all.has(song.id)) continue;
        // Plain Subsonic album entries sometimes omit fields the track itself
        // would have carried; the album is the fallback source for all of
        // them, the same fallback this endpoint used before it spoke domain
        // entities — only the destination shape has changed.
        const withAlbumFallbacks: SubsonicSong & { id: string } = {
          ...song,
          id: song.id,
          artist: song.artist ?? album.artist,
          artistId: song.artistId ?? album.artistId,
          albumId: song.albumId ?? album.id,
          coverArt: song.coverArt ?? album.coverArt,
          created: song.created ?? album.created,
        };
        all.set(song.id, mapSong(withAlbumFallbacks, { provenance }));
      }
    }
  }

  return [...all.values()];
}

export async function getTracks(client: NavidromeClient, provenance: Provenance): Promise<Song[]> {
  // OpenSubsonic servers (Navidrome, recent gonic) return the full library for an
  // empty search3 query; plain Subsonic servers (Ampache, Airsonic, …) return
  // nothing or an error for it, so fall back to walking the album list.
  let viaSearch: Song[] = [];
  try {
    viaSearch = await getTracksViaSearch(client, provenance);
  } catch {
    viaSearch = [];
  }
  if (viaSearch.length > 0) return viaSearch;

  return getTracksViaAlbumList(client, provenance);
}
