import { createSelector } from "@reduxjs/toolkit";
import { parseLocalId } from "@/domain/identity/LocalId";
import { RootState } from "@/state/redux/store";
import type { EntityTotals } from "@/state/redux/slices/listeningSlice";

/**
 * The local half of every figure here now comes from the listening log.
 *
 * It used to come from a parallel counter (`incrementPlay`) written from the
 * same call site a moment after the log, which was two records of one fact and
 * the dumber of the two: it could not see a skip, because it only ran once a
 * listen passed the scrobble threshold.
 *
 * **The merge rule changed with it, and had to.** The counter was an
 * *optimistic overlay*: local plays were added to the server's, then deleted
 * per entity the moment the server's own count arrived including them. A log
 * cannot be deleted -- it is the listener's history, not a pending write -- so
 * adding the two would double-count every listen this device made that the
 * server also knows about, permanently.
 *
 * So the two are reconciled by `Math.max`. Where the server has a number it
 * wins, because it also knows about every other client; where it has none --
 * scrobbling switched off, the server unreachable, a listen it declined to
 * record -- the local one shows through. Neither drags the other down, and
 * nothing is counted twice.
 */
function totalsToCounts(
  totals: Record<string, EntityTotals>,
  serverId: string | null,
  read: (entry: EntityTotals) => number,
): Record<string, number> {
  if (!serverId) return {};
  const prefix = PREFIX(serverId);
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(totals)) {
    if (!key.startsWith(prefix)) continue;
    const value = read(entry);
    if (value > 0) out[key.slice(prefix.length)] = value;
  }
  return out;
}

function mergeHighest(
  server: Record<string, number>,
  local: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...server };
  for (const [id, value] of Object.entries(local)) {
    merged[id] = Math.max(merged[id] ?? 0, value);
  }
  return merged;
}

const PREFIX = (serverId: string) => `${serverId}:`;

function filterByServer<T>(map: Record<string, T>, serverId: string | null): Record<string, T> {
  if (!serverId) return {};
  const prefix = PREFIX(serverId);
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}


export const selectSongLastPlayedAt = createSelector(
  [
    (s: RootState) => s.listening.totals,
    (s: RootState) => s.stats.serverSongLastPlayedAt,
    (s: RootState) => s.servers.activeServerId,
  ],
  (totals, serverMap, serverId) => mergeHighest(
    filterByServer(serverMap, serverId),
    totalsToCounts(totals, serverId, entry => entry.lastAt),
  )
);

export const selectSongPlayCounts = createSelector(
  [
    (s: RootState) => s.listening.totals,
    (s: RootState) => s.stats.serverSongPlays,
    (s: RootState) => s.servers.activeServerId,
  ],
  (totals, serverMap, serverId) => mergeHighest(
    filterByServer(serverMap, serverId),
    totalsToCounts(totals, serverId, entry => entry.plays),
  )
);

export const selectAlbumLastPlayedAt = createSelector(
  [
    (s: RootState) => s.listening.albums,
    (s: RootState) => s.stats.serverAlbumLastPlayedAt,
    (s: RootState) => s.servers.activeServerId,
  ],
  (albums, serverMap, serverId) => mergeHighest(
    filterByServer(serverMap, serverId),
    totalsToCounts(albums, serverId, entry => entry.lastAt),
  )
);

export const selectAlbumPlayCounts = createSelector(
  [
    (s: RootState) => s.listening.albums,
    (s: RootState) => s.stats.serverAlbumPlays,
    (s: RootState) => s.servers.activeServerId,
  ],
  (albums, serverMap, serverId) => mergeHighest(
    filterByServer(serverMap, serverId),
    totalsToCounts(albums, serverId, entry => entry.plays),
  )
);

/* No server half at all: neither Subsonic nor Jellyfin reports an artist play
 * count, so the log is the whole truth here rather than an overlay on one. */
export const selectArtistLastPlayedAt = createSelector(
  [(s: RootState) => s.listening.artists, (s: RootState) => s.servers.activeServerId],
  (artists, serverId) => totalsToCounts(artists, serverId, entry => entry.lastAt)
);

export const selectArtistPlayCounts = createSelector(
  [(s: RootState) => s.listening.artists, (s: RootState) => s.servers.activeServerId],
  (artists, serverId) => totalsToCounts(artists, serverId, entry => entry.plays)
);

/**
 * Playlist stats keyed by the playlist's own id.
 *
 * For a while the queue named a playlist by its `localId`, so its plays were
 * recorded under that while every reader looked playlists up by `nativeId` —
 * saved, and never found. Those entries are folded back in on read rather
 * than rewritten in storage: counts for the same playlist add up, and
 * last-played times keep the later one.
 */
function byPlaylistNativeId(map: Record<string, number>, combine: (a: number, b: number) => number) {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(map)) {
    const parsed = parseLocalId(id);
    const key = parsed?.kind === "playlist" ? parsed.nativeId : id;
    out[key] = key in out ? combine(out[key], value) : value;
  }
  return out;
}

export const selectPlaylistLastPlayedAt = createSelector(
  [(s: RootState) => s.listening.playlists, (s: RootState) => s.servers.activeServerId],
  (playlists, serverId) =>
    byPlaylistNativeId(totalsToCounts(playlists, serverId, entry => entry.lastAt), Math.max)
);

export const selectPlaylistPlayCounts = createSelector(
  [(s: RootState) => s.listening.playlists, (s: RootState) => s.servers.activeServerId],
  (playlists, serverId) =>
    byPlaylistNativeId(totalsToCounts(playlists, serverId, entry => entry.plays), (a, b) => a + b)
);

export const selectSongPlayCount =
  (songId: string) =>
  (state: RootState): number => {
    const serverId = state.servers.activeServerId;
    if (!serverId) return 0;
    const local = state.listening.totals[`${serverId}:${songId}`]?.plays ?? 0;
    const server = state.stats.serverSongPlays[`${serverId}:${songId}`] ?? 0;
    return Math.max(server, local);
  };

export const selectAlbumPlayCount =
  (albumId: string) =>
  (state: RootState): number => {
    const serverId = state.servers.activeServerId;
    if (!serverId) return 0;
    const local = state.listening.albums[`${serverId}:${albumId}`]?.plays ?? 0;
    const server = state.stats.serverAlbumPlays[`${serverId}:${albumId}`] ?? 0;
    return Math.max(server, local);
  };

export const selectArtistPlayCount =
  (artistId: string) =>
  (state: RootState): number => {
    const serverId = state.servers.activeServerId;
    if (!serverId) return 0;
    return state.listening.artists[`${serverId}:${artistId}`]?.plays ?? 0;
  };
