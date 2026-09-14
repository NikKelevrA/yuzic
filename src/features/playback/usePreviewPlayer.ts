import { useCallback } from 'react';
import { usePlaying } from '@/features/playback/PlayingContext';
import type { Song } from '@/domain/entities/Song';
import type { PlaylistDetail } from '@/domain/entities/Detail';
import { makeLocalId } from '@/domain/identity/LocalId';
import { integrationProvenance } from '@/domain/identity/Provenance';

/**
 * Attaches a freshly-resolved preview URL to an already-mapped preview `Song`
 * (Deezer's `mapSong`/`mapPreviewTrack` — identity, artist/album refs and
 * `contentKind: 'preview'` are already correct on it) so the queue has
 * somewhere to read it from.
 *
 * `streamId` — not a new field — is what every other adapter uses to carry
 * "the id to build a stream from where that isn't `nativeId`" (see
 * `Song.streamId`); a preview's playable resource *is* that resolved URL, so
 * this is the same slot doing the same job.
 */
function attachPreviewUrl(song: Song, previewUrl: string): Song {
  return { ...song, streamId: previewUrl };
}

export function usePreviewPlayer() {
  const { playSong, playSongInCollection, pauseSong, resumeSong, addToQueue, playNext, currentSong, isPlaying: mainIsPlaying } = usePlaying();

  /** Play a single preview (no album context). */
  const toggle = useCallback(async (song: Song, url: string) => {
    const track = attachPreviewUrl(song, url);
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
    song: Song,
    url: string,
    albumPreviewSongs: Song[],
    albumId: string,
    albumTitle: string,
  ) => {
    const track = attachPreviewUrl(song, url);
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

  const addPreviewToQueue = useCallback((song: Song, url: string) => {
    addToQueue(attachPreviewUrl(song, url));
  }, [addToQueue]);

  const playPreviewNext = useCallback((song: Song, url: string) => {
    playNext(attachPreviewUrl(song, url));
  }, [playNext]);

  return { toggle, toggleInAlbum, addPreviewToQueue, playPreviewNext };
}
