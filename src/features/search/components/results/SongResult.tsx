import React, { useRef } from 'react';
import { Ellipsis } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import type { SearchResult } from '@/features/search/SearchContext';
import type { Album } from '@/domain/entities/Album';
import { songResultToAlbum } from '@/features/search/searchResultAdapters';
import MediaListRow from '@/components/MediaListRow';
import IconActionButton from '@/components/IconActionButton';
import SongOptions from '@/components/options/SongOptions';
import { useSheetRef } from '@/components/useSheetRef';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize } from '@/constants/design';
import { notify } from '@/components/toast';
import { useAcquireAndPlaySong } from '@/features/downloaders/useAcquireAndPlaySong';

type Props = {
  result: SearchResult;
  navigateToAlbum: (album: Album) => void;
  onSelect: (result: SearchResult) => void;
  onPress: (result: SearchResult) => void;
  onOptions: (result: SearchResult) => void;
};

/**
 * A song result row, branching on provenance the same way `AlbumResult` does
 * (as an internal decision on the one component, not a second one `ResultRow`
 * would have to pick between — see its own doc comment).
 *
 * A local match plays on tap, same as it always has. An external match —
 * MusicBrainz today, through `searchRecording`/`mapRecordingSearchHit` —
 * carries no stream (`mapSong`'s own note: MusicBrainz never had one to begin
 * with), so there is nothing "play" can mean for it. What it does have is
 * exactly what `SongRow`'s own external branch already offers a track row
 * elsewhere in the app — Want / Get this track / Get the album — through the
 * same `SongOptions` sheet, opened here on tap rather than behind a second
 * "..." tap: search is the one place a first tap on an external song was
 * previously spent on a full album navigation (a round trip to the server
 * for the release-group and its tracks) that nobody asked for and that was
 * the slow part, when what the tap almost always meant was "get this song".
 * Falls back to the album (the old behaviour) only on the rare hit with no
 * resolved `song` to open a sheet for.
 *
 * With a self-hosted MusicBrainz server and a downloader connected, the tap
 * skips the sheet (and the album fallback) entirely: `acquireAndPlaySong`
 * plays the track outright if it's already in the library, or silently
 * starts a Get and plays it the moment it lands — see
 * `useAcquireAndPlaySong`'s own doc for why "the moment it lands" is a real
 * thing this can wait for, not a guess. Without that setup, nothing here
 * changes: same sheet, same fallback, same as basic 2.9.0.
 *
 * Debounced the same way `TrackItem`'s tap is (`pressInFlightRef` + a
 * cooldown): unlike a plain local play, a "not owned" tap here fires a real
 * network request to a downloader with no dedup of its own. Two `acquireAndPlay`
 * calls for the same row — a genuine fast double-tap, or `Pressable` firing
 * twice, which this row had no guard against — sent two independent Get
 * requests for the same track, confirmed server-side as two near-simultaneous
 * downloads racing to write the same file (one silently overwriting the
 * other's output partway through). That race is a very plausible cause of a
 * track that downloads, gets indexed, even streams fine in isolation, but
 * then won't play from the app — the file on disk may no longer be the one
 * that got scanned.
 */
const SONG_RESULT_PRESS_COOLDOWN_MS = 700;

export default function SongResult({ result, navigateToAlbum, onSelect, onPress, onOptions }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const optionsSheetRef = useSheetRef();
  const { canAcquireAndPlay, selfHostedMusicbrainzConfigured, acquireAndPlay } = useAcquireAndPlaySong();

  const pressInFlightRef = useRef(false);
  const lastPressAtRef = useRef(0);

  // A leading type word keeps this row from reading as an album when a
  // search mixes both kinds — see AlbumResult's matching prefix.
  const subtitle = `${t('search.entityTypes.song')} · ${result.subtext}`;

  if (result.source === 'external') {
    const song = result.song;
    const albumTitle = song?.album.title ?? '';
    const albumArtist = song?.artist.name || result.subtext;
    return (
      <>
        <MediaListRow
          title={result.title}
          testID="search-result-song"
          subtitle={subtitle}
          cover={result.cover}
          onPress={() => {
            const now = Date.now();
            if (now - lastPressAtRef.current < SONG_RESULT_PRESS_COOLDOWN_MS) return;
            if (pressInFlightRef.current) return;
            lastPressAtRef.current = now;

            onSelect(result);
            if (song && canAcquireAndPlay) {
              const albumStub = songResultToAlbum(result);
              if (albumStub) {
                pressInFlightRef.current = true;
                void acquireAndPlay(song, albumStub).then(handled => {
                  // Nothing could be done for this hit (shouldn't happen
                  // when `canAcquireAndPlay` is true and a song resolved,
                  // but falls through to the ordinary sheet rather than
                  // leaving the tap looking like it did nothing).
                  if (!handled) optionsSheetRef.current?.present();
                }).finally(() => { pressInFlightRef.current = false; });
                return;
              }
            }
            if (song && selfHostedMusicbrainzConfigured && !canAcquireAndPlay) {
              // Self-hosted MusicBrainz is on but no downloader is currently
              // detected as connected — say so instead of silently falling
              // to the sheet, since that silence is indistinguishable from a
              // broken tap otherwise.
              notify.info(t('externalAlbum.download.noDownloaderConnected'));
            }
            if (song) {
              optionsSheetRef.current?.present();
              return;
            }
            // No resolved song to build a sheet for — the same fallback the
            // row always had.
            const album = songResultToAlbum(result);
            if (album) navigateToAlbum(album);
          }}
        />
        {song && (
          <SongOptions
            ref={optionsSheetRef}
            selectedSong={song}
            albumTitle={albumTitle}
            albumArtist={albumArtist}
          />
        )}
      </>
    );
  }

  return (
    <MediaListRow
      title={result.title}
      testID="search-result-song"
      subtitle={subtitle}
      cover={result.cover}
      onPress={() => onPress(result)}
      trailing={
        <IconActionButton
          icon={<Ellipsis size={iconSize.header} color={colors.secondary} />}
          onPress={() => onOptions(result)}
          accessibilityLabel={t('a11y.rows.options', { title: result.title })}
          size="compact"
        />
      }
    />
  );
}
