/**
 * An entity together with the collection that was loaded alongside it.
 *
 * Albums and playlists reference their tracks by id rather than embedding
 * them, which is what stops `Album` growing back into an object that holds
 * every song, each holding its own album. But the endpoints that return an
 * album usually return its tracks in the same response, and throwing them away
 * only to fetch them again would be worse than embedding.
 *
 * So the pair is made explicit. A caller that only needs to render a shelf
 * takes the entity; a caller that needs the track list takes the detail. What
 * it never gets is an entity whose track list is sometimes populated and
 * sometimes silently empty, which is the ambiguity `songs: Song[]` had —
 * `songIds: []` could not be told apart from "not loaded yet".
 */
import type { Album } from './Album';
import type { Playlist } from './Playlist';
import type { Song } from './Song';

export interface AlbumDetail {
  album: Album;
  /** The album's tracks in running order. Matches `album.songIds`. */
  songs: Song[];
}

export interface PlaylistDetail {
  playlist: Playlist;
  /** The playlist's tracks in playlist order. Matches `playlist.songIds`. */
  songs: Song[];
}
