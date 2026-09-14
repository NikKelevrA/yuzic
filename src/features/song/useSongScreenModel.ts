/**
 * The currently-playing song -> its canonical album, the artist to navigate
 * to, and its resolved lyrics — the "song detail" orchestration `playing/`
 * needs to render around the player itself.
 *
 * This is deliberately not a route-params identity resolver like
 * `useArtistScreenModel`/`useAlbumScreenModel`/`usePlaylistScreenModel`:
 * there is no `src/screens/song/` route today (no `/songView`), so "song
 * detail" only ever exists as the now-playing panel inside `playing/`, keyed
 * off `PlayingContext`'s own `currentSong` rather than a navigated-to id.
 * Playback itself — sourcing `currentSong`, transport, the queue — stays
 * PlayingContext's; this only resolves what the *panel* shows about it.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { InteractionManager } from 'react-native';
import { useApi } from '@/providers/registry/useApi';
import { useAlbum } from '@/features/album/useAlbum';
import type { Song } from '@/domain/entities/Song';
import type { Album } from '@/domain/entities/Album';
import type { LyricsResult } from '@/providers/contracts/ServerAdapter';
import { selectEnabledSourcesFor } from '@/features/settings/sources/state';
import { resolveLyrics, type ExternalLyricsSourceId } from '@/features/lyrics/resolveLyrics';
import { externalLyricsFetchers } from '@/providers/registry/lyricsFetchers';

export type SongScreenModel = {
  song: Song | null;
  /** The current song's canonical album — resolved by id, same record the
   *  album screen itself would show. */
  album: Album | null;
  /** The artist to navigate to from the song-detail panel: the song's own
   *  artist id, falling back to the resolved album's artist when the song
   *  doesn't carry one of its own. */
  artistId: string | null;
  lyrics: LyricsResult | null;
  lyricsAvailable: boolean;
};

export function useSongScreenModel(song: Song | null): SongScreenModel {
  const api = useApi();
  const { album } = useAlbum(song?.album.nativeId ?? '');
  const artistId = song?.artist.nativeId ?? album?.artist?.nativeId ?? null;

  const enabledExternalLyricsSourceIds = useSelector(selectEnabledSourcesFor('lyrics'));
  // The redux slice stores plain strings so it never has to know about this
  // union; narrow to the ids the resolver actually recognises here, at the
  // one place that reads it.
  const enabledExternalLyricsSources = useMemo(
    () => enabledExternalLyricsSourceIds.filter(
      (id): id is ExternalLyricsSourceId => id in externalLyricsFetchers
    ),
    [enabledExternalLyricsSourceIds]
  );

  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [lyricsAvailable, setLyricsAvailable] = useState(false);

  useEffect(() => {
    if (!song?.nativeId) return;

    let cancelled = false;
    setLyrics(null);
    setLyricsAvailable(false);

    const task = InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const res = await resolveLyrics({
            song: {
              songId: song.nativeId,
              title: song.title,
              artist: song.artist.name,
              album: song.album.title,
              durationSec: song.durationSeconds || undefined,
            },
            getServerLyrics: songId => api.lyrics.getBySongId(songId),
            enabledExternalSourcesInOrder: enabledExternalLyricsSources,
            fetchers: externalLyricsFetchers,
          });
          if (cancelled) return;
          if (res && res.lines.length > 0) {
            setLyrics(res);
            setLyricsAvailable(true);
          }
        } catch {
          // A track without lyrics is the common case, not a fault — the
          // panel just stays closed. Nothing to tell the user and nothing to
          // retry, so this stays silent on purpose.
        }
      })();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [api.lyrics, song?.nativeId, song?.title, song?.artist, song?.album, song?.durationSeconds, enabledExternalLyricsSources]);

  return { song, album, artistId, lyrics, lyricsAvailable };
}
