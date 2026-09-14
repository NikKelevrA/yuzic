import type { Song } from "@/domain/entities/Song";
import type { NowPlayingEntry } from "@/providers/contracts/ServerAdapter";
import { requireProvenance, type MediaBrowserClient } from "../client";
import { mapSong } from "../mapSong";
import type { MediaBrowserItem, MediaBrowserItemsResponse } from "../types";

const SONG_FIELDS =
  "RunTimeTicks,ArtistItems,AlbumId,ProductionYear,DateCreated,UserData,IndexNumber,ParentIndexNumber,MediaSources,Genres";

/** How recently a session must have been active to count as listening now. */
const ACTIVE_WITHIN_SECONDS = 960;

type RandomSongsOptions = { size?: number; genre?: string; fromYear?: number; toYear?: number };

/**
 * A random slice of the library, optionally narrowed to a genre or a span of
 * years. The server does the drawing (`SortBy=Random`), so a large library
 * costs one page, not a download of every track.
 */
export async function getRandomSongs(
  client: MediaBrowserClient,
  opts: RandomSongsOptions = {}
): Promise<Song[]> {
  const params = new URLSearchParams({
    IncludeItemTypes: "Audio",
    Recursive: "true",
    SortBy: "Random",
    Limit: String(opts.size ?? 50),
    Fields: SONG_FIELDS,
  });
  if (opts.genre) params.set("Genres", opts.genre);
  if (opts.fromYear || opts.toYear) {
    const from = opts.fromYear ?? opts.toYear!;
    const to = opts.toYear ?? opts.fromYear!;
    const years: number[] = [];
    for (let year = Math.min(from, to); year <= Math.max(from, to); year++) years.push(year);
    params.set("Years", years.join(","));
  }
  if (client.parentId) params.set("ParentId", client.parentId);

  const raw = await client.request<MediaBrowserItemsResponse>(
    `/Users/${encodeURIComponent(client.userId)}/Items?${params.toString()}`
  );
  const provenance = requireProvenance(client);
  return (raw?.Items ?? [])
    .filter((item) => item?.Id)
    .map((item) => mapSong(item, { provenance, brand: client.brand }));
}

type MediaBrowserSession = {
  UserName?: string;
  LastActivityDate?: string;
  NowPlayingItem?: MediaBrowserItem;
};

/**
 * What people are playing on this server right now, from its sessions. A
 * session playing a film or an episode is not a track anyone can open here,
 * so only audio counts.
 */
export async function getNowPlaying(
  client: MediaBrowserClient,
  now: () => number = Date.now
): Promise<NowPlayingEntry[]> {
  const sessions = await client.request<MediaBrowserSession[]>(
    `/Sessions?ActiveWithinSeconds=${ACTIVE_WITHIN_SECONDS}`
  );
  if (!Array.isArray(sessions)) return [];
  const provenance = requireProvenance(client);

  return sessions.flatMap((session): NowPlayingEntry[] => {
    const item = session.NowPlayingItem;
    if (!item?.Id || item.Type !== "Audio" || !session.UserName) return [];
    const song = mapSong(item, { provenance, brand: client.brand });
    const lastActive = session.LastActivityDate ? Date.parse(session.LastActivityDate) : NaN;
    return [{
      songId: song.nativeId,
      title: song.title,
      artist: song.artist.name,
      albumTitle: song.album.title || undefined,
      albumId: song.album.nativeId || undefined,
      cover: song.cover,
      username: session.UserName,
      minutesAgo: Number.isFinite(lastActive)
        ? Math.max(0, Math.round((now() - lastActive) / 60_000))
        : undefined,
    }];
  });
}
