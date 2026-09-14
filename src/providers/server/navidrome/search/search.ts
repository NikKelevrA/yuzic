import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Song } from '@/domain/entities/Song';
import type { Provenance } from '@/domain/identity/Provenance';
import type { NavidromeClient } from '../client';
import { mapAlbum } from '../mapAlbum';
import { mapArtist } from '../mapArtist';
import { mapSong } from '../mapSong';
import { SubsonicResponse } from '../types';

type NavidromeSearchResult = {
  albums: Album[];
  artists: Artist[];
  songs: Song[];
};

export async function search(
  client: NavidromeClient,
  provenance: Provenance,
  query: string
): Promise<NavidromeSearchResult> {
  if (!query.trim()) {
    return { albums: [], artists: [], songs: [] };
  }

  const data = await client.request<SubsonicResponse>("search3.view", {
    query,
    artistCount: 20,
    albumCount: 20,
    songCount: 20,
  });

  const r = data['subsonic-response']?.searchResult3;
  if (!r) {
    return { albums: [], artists: [], songs: [] };
  }

  return {
    albums: (r.album ?? []).map((a) => mapAlbum(a, { provenance })),
    artists: (r.artist ?? []).map((a) => mapArtist(a, provenance)),
    songs: (r.song ?? [])
      .filter((s): s is typeof s & { id: string } => !!s?.id)
      .map((s) => mapSong(s, { provenance })),
  };
}
