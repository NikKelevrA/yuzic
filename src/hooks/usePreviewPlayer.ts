import { useCallback } from 'react';
import { usePlaying } from '@/contexts/PlayingContext';
import { ExternalSong } from '@/types';
import type { Song } from '@/domain/entities/Song';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { normalizeExternalIds } from '@/domain/identity/ExternalIds';

/**
 * Turns a search/browse preview into a domain `Song` the queue can hold.
 *
 * Provenance is read off the record rather than assumed. Only one catalogue
 * supplies previews today, but naming it here would make this the place a
 * second one silently inherits the first one's identity — two providers'
 * track `42` would collapse into the same `LocalId`, and the queue would treat
 * them as the same track. `unknown` is recorded when the record genuinely does
 * not say, which is still distinct from claiming a source it never had.
 */
export function externalSongToTrack(song: ExternalSong, previewUrl: string): Song {
  const provenance = integrationProvenance(song.externalSource ?? 'unknown');
  const artistLocalId = makeLocalId('artist', provenance, song.id);
  const albumLocalId = makeLocalId('album', provenance, song.albumId);
  return {
    localId: makeLocalId('song', provenance, song.id),
    nativeId: song.id,
    provenance,
    // The ids the record already carries; matching needs them to relate this
    // preview to a library track the user may already own.
    externalIds: normalizeExternalIds(song.externalIds),
    // Known only through an enabled integration — browse and preview only.
    libraryState: 'external',
    title: song.title,
    artist: { localId: artistLocalId, nativeId: '', externalIds: {}, name: song.artist, cover: { kind: 'none' } },
    album: { localId: albumLocalId, nativeId: song.albumId, externalIds: {}, title: '', cover: song.cover },
    cover: song.cover,
    durationSeconds: 30,
    contentKind: 'preview',
    genres: [],
    streamId: previewUrl,
  };
}

export function usePreviewPlayer() {
  const { playSong, playSongInCollection, pauseSong, resumeSong, addToQueue, playNext, currentSong, isPlaying: mainIsPlaying } = usePlaying();

  /** Play a single preview (no album context). */
  const toggle = useCallback(async (song: ExternalSong, url: string) => {
    const track = externalSongToTrack(song, url);
    if (currentSong?.localId === track.localId) {
      if (mainIsPlaying) await pauseSong();
      else await resumeSong();
    } else {
      await playSong(track);
    }
  }, [currentSong, mainIsPlaying, playSong, pauseSong, resumeSong]);

  /**
   * Play a preview song in the context of its album — puts all preview tracks
   * from the album into the queue so skip-next/prev work across the album.
   */
  const toggleInAlbum = useCallback(async (
    song: ExternalSong,
    url: string,
    albumPreviewSongs: Song[],
    albumId: string,
    albumTitle: string,
  ) => {
    const track = externalSongToTrack(song, url);
    if (currentSong?.localId === track.localId) {
      if (mainIsPlaying) await pauseSong();
      else await resumeSong();
      return;
    }
    if (albumPreviewSongs.length <= 1) {
      await playSong(track);
      return;
    }
    // Synthetic — a preview album is never a real library playlist, so this
    // exists only to give playSongInCollection something to queue skip/prev
    // across. Not persisted, not addressable by id anywhere else.
    // The synthetic collection takes its provenance from the tracks it holds,
    // for the same reason they take theirs from their own records.
    const collectionProvenance = albumPreviewSongs[0]?.provenance
      ?? integrationProvenance('unknown');
    const collection: PlaylistDetail = {
      playlist: {
        localId: makeLocalId('playlist', collectionProvenance, albumId),
        nativeId: albumId,
        provenance: collectionProvenance,
        externalIds: {},
        libraryState: 'external',
        title: albumTitle,
        cover: albumPreviewSongs[0]?.cover ?? { kind: 'none' },
        isOwned: false,
        songIds: albumPreviewSongs.map(s => s.localId),
      },
      songs: albumPreviewSongs,
    };
    await playSongInCollection(track, collection);
  }, [currentSong, mainIsPlaying, playSong, playSongInCollection, pauseSong, resumeSong]);

  const addPreviewToQueue = useCallback((song: ExternalSong, url: string) => {
    addToQueue(externalSongToTrack(song, url));
  }, [addToQueue]);

  const playPreviewNext = useCallback((song: ExternalSong, url: string) => {
    playNext(externalSongToTrack(song, url));
  }, [playNext]);

  return { toggle, toggleInAlbum, addPreviewToQueue, playPreviewNext };
}
