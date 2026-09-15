/**
 * Deezer's raw DTO shapes, as read by this adapter.
 *
 * Kept separate from `catalog.ts` (which fetches and caches these) so the
 * mappers (`mapAlbum`/`mapArtist`/`mapSong`/`mapRefs`) can depend on the DTO
 * shapes without depending on `catalog.ts` itself — `catalog.ts` calls into
 * the mappers to turn a fetched DTO into a domain entity, and a mapper
 * importing back from `catalog.ts` for its input type would be a cycle.
 */

type DeezerImageEntity = {
  picture_xl?: string | null;
  picture_big?: string | null;
  picture_medium?: string | null;
  cover_xl?: string | null;
  cover_big?: string | null;
  cover_medium?: string | null;
};

export type DeezerArtist = DeezerImageEntity & {
  id: number;
  name: string;
  nb_album?: number;
  nb_fan?: number;
};

export type DeezerAlbum = DeezerImageEntity & {
  id: number;
  title: string;
  artist: DeezerArtist;
  release_date?: string | null;
  record_type?: string | null;
  nb_tracks?: number;
  upc?: string | null;
  tracks?: { data?: DeezerTrack[] };
};

export type DeezerTrack = {
  id: number;
  title: string;
  duration?: number;
  preview?: string | null;
  isrc?: string | null;
  rank?: number;
  artist?: DeezerArtist;
  album?: DeezerAlbum;
};

/**
 * A track minted specifically by `albums/index.ts`'s `searchAlbumPreviews` to
 * let a library album with no local copy play a 30-second snippet — see
 * `mapSong.ts`'s module doc for how this differs from `DeezerTrack`.
 */
export type DeezerPreviewTrack = {
  id: number;
  title: string;
  track_position: number;
  preview: string;
  duration: number;
};
