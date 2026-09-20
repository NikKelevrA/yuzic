/**
 * The catalog, indexed once, so a screen can ask a question instead of
 * scanning for the answer.
 *
 * **What this replaces.** The catalog reached screens as three arrays, so
 * every question about it was asked by hand: nine `new Map(xs.map(...))`
 * indexes, nine linear `xs.find(x => x.nativeId === id)` lookups and four
 * `xs.filter(x => x.artist.nativeId === id)` joins, each a full pass over the
 * library, each rebuilt per component. That is a query engine written
 * twenty-two times over an unindexed list.
 *
 * One pass builds all of it here instead. The maps below are the indexes the
 * call sites were building anyway; the relationships are the joins they were
 * scanning for.
 *
 * **Ids, not copies.** Relationships are stored as `LocalId` arrays rather
 * than entity arrays, so a song appearing on an album and under an artist is
 * one object referenced twice, not two. Resolution happens at the edge, in
 * the query functions below, where the caller wanted entities anyway.
 *
 * **This is the seam.** Nothing above it knows the catalog is currently three
 * arrays in memory. That is what lets the backing store change later without
 * touching the screens that read it — which is the whole reason for doing
 * this rather than making the arrays smaller.
 */
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { makeLocalId, type LocalId } from '@/domain/identity/LocalId';
import type { Provenance } from '@/domain/identity/Provenance';

export interface Catalog {
  readonly songs: readonly Song[];
  readonly albums: readonly Album[];
  readonly artists: readonly Artist[];
  readonly playlists: readonly Playlist[];
}

export interface CatalogStore {
  /** Every entity, by its own id. */
  readonly songs: ReadonlyMap<LocalId, Song>;
  readonly albums: ReadonlyMap<LocalId, Album>;
  readonly artists: ReadonlyMap<LocalId, Artist>;
  readonly playlists: ReadonlyMap<LocalId, Playlist>;

  /**
   * The same entities by the id their server gave them.
   *
   * A `LocalId` is derivable from a native id, but only with the provenance
   * in hand, and half the call sites that look one up do not have it — they
   * have an id out of a download queue or a URL. Kept as its own index rather
   * than pushing that problem outward.
   */
  readonly songByNativeId: ReadonlyMap<string, Song>;
  readonly albumByNativeId: ReadonlyMap<string, Album>;
  readonly artistByNativeId: ReadonlyMap<string, Artist>;
  readonly playlistByNativeId: ReadonlyMap<string, Playlist>;

  /** Relationships, resolved once rather than scanned per call. */
  readonly albumIdsByArtist: ReadonlyMap<LocalId, readonly LocalId[]>;
  readonly songIdsByAlbum: ReadonlyMap<LocalId, readonly LocalId[]>;
  readonly songIdsByArtist: ReadonlyMap<LocalId, readonly LocalId[]>;
  readonly albumIdsByGenre: ReadonlyMap<string, readonly LocalId[]>;

  /**
   * The provenance every record in this catalog shares.
   *
   * A catalog is one server's library, so there is exactly one. Holding it
   * lets a caller that has a native id — which is what routes carry — reach a
   * relationship keyed by `LocalId` without a second set of indexes, since
   * `makeLocalId` is a pure function of the two. Null only for an empty
   * catalog, where every lookup misses anyway.
   */
  readonly provenance: Provenance | null;

  /** What the catalog held, for callers that still need the whole list. */
  readonly catalog: Catalog;
}

/**
 * One shared empty result.
 *
 * Returned for every miss so a query's result is referentially stable across
 * calls: a fresh `[]` each time would make every `useMemo` keyed on it
 * recompute, which is the bug this whole exercise is about.
 */
const EMPTY: readonly LocalId[] = Object.freeze([]);

function pushInto<K>(map: Map<K, LocalId[]>, key: K, id: LocalId): void {
  const existing = map.get(key);
  if (existing) existing.push(id);
  else map.set(key, [id]);
}

export function buildCatalogStore(catalog: Catalog): CatalogStore {
  const songs = new Map<LocalId, Song>();
  const albums = new Map<LocalId, Album>();
  const artists = new Map<LocalId, Artist>();
  const songByNativeId = new Map<string, Song>();
  const albumByNativeId = new Map<string, Album>();
  const artistByNativeId = new Map<string, Artist>();
  const playlists = new Map<LocalId, Playlist>();
  const playlistByNativeId = new Map<string, Playlist>();
  const albumIdsByArtist = new Map<LocalId, LocalId[]>();
  const songIdsByAlbum = new Map<LocalId, LocalId[]>();
  const songIdsByArtist = new Map<LocalId, LocalId[]>();
  const albumIdsByGenre = new Map<string, LocalId[]>();

  for (const artist of catalog.artists) {
    artists.set(artist.localId, artist);
    // First writer wins, matching the identity index next door: a catalog
    // that somehow holds the same native id twice keeps the earlier record
    // rather than flipping between them.
    if (!artistByNativeId.has(artist.nativeId)) artistByNativeId.set(artist.nativeId, artist);
  }

  for (const playlist of catalog.playlists) {
    playlists.set(playlist.localId, playlist);
    if (!playlistByNativeId.has(playlist.nativeId)) {
      playlistByNativeId.set(playlist.nativeId, playlist);
    }
  }

  for (const album of catalog.albums) {
    albums.set(album.localId, album);
    if (!albumByNativeId.has(album.nativeId)) albumByNativeId.set(album.nativeId, album);
    pushInto(albumIdsByArtist, album.artist.localId, album.localId);
    for (const genre of album.genres) pushInto(albumIdsByGenre, genre, album.localId);
  }

  for (const song of catalog.songs) {
    songs.set(song.localId, song);
    if (!songByNativeId.has(song.nativeId)) songByNativeId.set(song.nativeId, song);
    pushInto(songIdsByAlbum, song.album.localId, song.localId);
    pushInto(songIdsByArtist, song.artist.localId, song.localId);
  }

  const provenance =
    catalog.songs[0]?.provenance ??
    catalog.albums[0]?.provenance ??
    catalog.artists[0]?.provenance ??
    catalog.playlists[0]?.provenance ??
    null;

  return {
    songs,
    albums,
    artists,
    playlists,
    songByNativeId,
    albumByNativeId,
    artistByNativeId,
    playlistByNativeId,
    albumIdsByArtist,
    songIdsByAlbum,
    songIdsByArtist,
    albumIdsByGenre,
    provenance,
    catalog,
  };
}

/** Resolves a list of ids, skipping any the catalog no longer holds. */
function resolve<T>(ids: readonly LocalId[], from: ReadonlyMap<LocalId, T>): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const entity = from.get(id);
    if (entity) out.push(entity);
  }
  return out;
}

export const albumsByArtist = (store: CatalogStore, artistId: LocalId): Album[] =>
  resolve(store.albumIdsByArtist.get(artistId) ?? EMPTY, store.albums);

export const songsByAlbum = (store: CatalogStore, albumId: LocalId): Song[] =>
  resolve(store.songIdsByAlbum.get(albumId) ?? EMPTY, store.songs);

export const songsByArtist = (store: CatalogStore, artistId: LocalId): Song[] =>
  resolve(store.songIdsByArtist.get(artistId) ?? EMPTY, store.songs);

export const albumsByGenre = (store: CatalogStore, genre: string): Album[] =>
  resolve(store.albumIdsByGenre.get(genre) ?? EMPTY, store.albums);

/**
 * The same relationships for a caller holding a native id.
 *
 * Routes carry native ids, relationships are keyed by `LocalId`, and one is a
 * pure function of the other given the catalog's provenance — so this derives
 * rather than keeping a second set of indexes in step with the first.
 */
const localIdFor = (
  store: CatalogStore,
  kind: 'artist' | 'album',
  nativeId: string
): LocalId | null =>
  store.provenance ? makeLocalId(kind, store.provenance, nativeId) : null;

export function albumsByArtistNativeId(store: CatalogStore, nativeId: string): Album[] {
  const id = localIdFor(store, 'artist', nativeId);
  return id ? albumsByArtist(store, id) : [];
}

export function songsByArtistNativeId(store: CatalogStore, nativeId: string): Song[] {
  const id = localIdFor(store, 'artist', nativeId);
  return id ? songsByArtist(store, id) : [];
}

export function songsByAlbumNativeId(store: CatalogStore, nativeId: string): Song[] {
  const id = localIdFor(store, 'album', nativeId);
  return id ? songsByAlbum(store, id) : [];
}
