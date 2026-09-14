import React, { forwardRef, useMemo } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import type { Song } from '@/domain/entities/Song';
import type { Album } from '@/domain/entities/Album';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '@/components/formatDuration';
import { useSheetRef } from '@/components/useSheetRef';
import GetReviewSheet from '@/components/options/GetReviewSheet';
import {
  OptionSheetChipsRow,
  OptionSheetDivider,
  OptionSheetInfoRow,
  OptionSheetSectionLabel,
} from './OptionSheetPrimitives';
import { EntityOptionsSheet } from '@/features/entity-actions/EntityOptionsSheet';
import { dismissSheetRef } from '@/features/entity-actions/shared/sheetRef';
import {
  useSongLibraryActions,
  useSongExternalActions,
  useExternalSongAlbumStub,
  useExternalSongTrack,
} from '@/features/entity-actions/hooks/useSongActions';

type SongOptionsProps = {
  selectedSong: Song;
  /** Library-song-only: opens the add-to-playlist sheet. Ignored for external songs. */
  onAddToPlaylist?: () => void;
  onNavigate?: () => void;
  /** External-song-only: album context for its options sheet. */
  albumTitle?: string;
  /** External-song-only: album context for its options sheet. */
  albumArtist?: string;
  /** External-song-only: called (and the sheet dismissed) when "Play" is pressed. */
  onPlay?: () => void;
};

function formatDate(value: string | number | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const year = d.getFullYear();
  const month = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate();
  return `${month} ${day}, ${year}`;
}

/**
 * True when `song` came from an external catalog (Deezer/etc) rather than
 * the user's library — read off `provenance`, the one place that
 * distinction lives now that there is a single `Song` type. Mirrors
 * `isExternalSong` in `components/rows/SongRow`.
 */
function isExternalSongOrigin(song: Song): boolean {
  return song.provenance.origin === 'integration';
}

const SongOptions = forwardRef<BottomSheetModal, SongOptionsProps>(
  ({ selectedSong, onAddToPlaylist, onNavigate, albumTitle, albumArtist, onPlay }, ref) => {
    if (isExternalSongOrigin(selectedSong)) {
      return (
        <ExternalSongOptionsSheet
          ref={ref}
          song={selectedSong}
          albumTitle={albumTitle ?? ''}
          albumArtist={albumArtist ?? ''}
          onPlay={onPlay}
        />
      );
    }
    return (
      <LibrarySongOptionsSheet
        ref={ref}
        selectedSong={selectedSong}
        onAddToPlaylist={onAddToPlaylist ?? (() => {})}
        onNavigate={onNavigate}
      />
    );
  }
);

SongOptions.displayName = 'SongOptions';

export default SongOptions;

// ---------------------------------------------------------------------------
// Library song action set.
// ---------------------------------------------------------------------------

type LibrarySongOptionsProps = {
  selectedSong: Song;
  onAddToPlaylist: () => void;
  onNavigate?: () => void;
};

const LibrarySongOptionsSheet = forwardRef<BottomSheetModal, LibrarySongOptionsProps>(
  ({ selectedSong, onAddToPlaylist, onNavigate }, ref) => {
    const { t } = useTranslation();
    const snapPoints = useMemo(() => ['55%', '90%'], []);
    const close = () => dismissSheetRef(ref);

    const { actions, playCount } = useSongLibraryActions(selectedSong, { onAddToPlaylist, onNavigate, close });

    return (
      <EntityOptionsSheet
        ref={ref}
        testID="song-options-sheet"
        snapPoints={snapPoints}
        header={{
          cover: selectedSong.cover,
          title: selectedSong.title,
          subtitle: selectedSong.artist.name || t('songOptions.unknownArtist'),
        }}
        actions={actions}
        infoSection={
          <>
            <OptionSheetDivider />
            <OptionSheetSectionLabel label={t('songOptions.sections.media')} />
            <OptionSheetInfoRow label={t('songOptions.media.duration')} value={formatDuration(selectedSong.durationSeconds)} />
            <OptionSheetInfoRow label={t('songOptions.media.plays')} value={playCount} />
            {selectedSong.audio?.bitrateKbps != null && (
              <OptionSheetInfoRow label={t('songOptions.media.bitrate')} value={t('songOptions.media.kbps', { value: selectedSong.audio.bitrateKbps })} />
            )}
            {selectedSong.audio?.sampleRateHz != null && (
              <OptionSheetInfoRow label={t('songOptions.media.sampleRate')} value={t('songOptions.media.hz', { value: selectedSong.audio.sampleRateHz })} />
            )}
            {selectedSong.audio?.bitsPerSample != null && (
              <OptionSheetInfoRow label={t('songOptions.media.bitsPerSample')} value={selectedSong.audio.bitsPerSample} />
            )}
            {selectedSong.audio?.mimeType && (
              <OptionSheetInfoRow label={t('songOptions.media.format')} value={selectedSong.audio.mimeType} valueLines={1} />
            )}
            {(selectedSong.discNumber != null || selectedSong.trackNumber != null) && (
              <>
                <OptionSheetSectionLabel label={t('songOptions.sections.track')} spaced />
                {selectedSong.discNumber != null && (
                  <OptionSheetInfoRow label={t('songOptions.track.disc')} value={selectedSong.discNumber} />
                )}
                {selectedSong.trackNumber != null && (
                  <OptionSheetInfoRow label={t('songOptions.track.track')} value={selectedSong.trackNumber} />
                )}
              </>
            )}
            {(selectedSong.year != null || selectedSong.addedAt != null) && (
              <>
                <OptionSheetSectionLabel label={t('songOptions.sections.dates')} spaced />
                {selectedSong.year != null && (
                  <OptionSheetInfoRow label={t('songOptions.dates.released')} value={formatDate(String(selectedSong.year))} />
                )}
                {selectedSong.addedAt != null && (
                  <OptionSheetInfoRow label={t('songOptions.dates.added')} value={formatDate(selectedSong.addedAt)} valueLines={1} />
                )}
              </>
            )}
            {selectedSong.genres.length > 0 && (
              <>
                <OptionSheetSectionLabel label={t('songOptions.sections.other')} spaced />
                <OptionSheetChipsRow label={t('songOptions.other.genres')} values={selectedSong.genres} />
              </>
            )}
          </>
        }
      />
    );
  }
);

LibrarySongOptionsSheet.displayName = 'LibrarySongOptionsSheet';

// ---------------------------------------------------------------------------
// External song action set.
// ---------------------------------------------------------------------------

type ExternalSongOptionsSheetProps = {
  song: Song;
  albumTitle: string;
  albumArtist: string;
  onPlay?: () => void;
};

const ExternalSongOptionsSheet = forwardRef<BottomSheetModal, ExternalSongOptionsSheetProps>(
  ({ song, albumTitle, albumArtist, onPlay }, ref) => {
    const { t } = useTranslation();
    const snapPoints = useMemo(() => ['40%', '70%'], []);
    const close = () => dismissSheetRef(ref);

    const downloadSheetRef = useSheetRef();
    const trackDownloadSheetRef = useSheetRef();

    const albumBase: Album = useExternalSongAlbumStub(song, albumTitle);
    const track = useExternalSongTrack(song, albumArtist);

    const { actions } = useSongExternalActions(song, {
      albumTitle, albumArtist, onPlay, close,
      openAlbumGet: () => downloadSheetRef.current?.present(),
      openTrackGet: () => trackDownloadSheetRef.current?.present(),
    });

    const hasAnyPrimaryRow = !!onPlay || actions.length > 0;

    return (
      <>
        <EntityOptionsSheet
          ref={ref}
          snapPoints={snapPoints}
          header={{ cover: song.cover, title: song.title, subtitle: `${albumArtist} — ${albumTitle}` }}
          actions={actions}
          infoSection={
            <>
              {hasAnyPrimaryRow && <OptionSheetDivider />}
              <OptionSheetSectionLabel label={t('songOptions.sections.media')} />
              <OptionSheetInfoRow label={t('songOptions.media.duration')} value={formatDuration(song.durationSeconds)} />
            </>
          }
        />

        <GetReviewSheet album={albumBase} sheetRef={downloadSheetRef} />
        <GetReviewSheet album={albumBase} track={track} sheetRef={trackDownloadSheetRef} />
      </>
    );
  }
);

ExternalSongOptionsSheet.displayName = 'ExternalSongOptionsSheet';
