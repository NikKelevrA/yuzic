import React, { memo, useRef } from "react";
import { InteractionManager } from "react-native";
import { useSongActionSheets } from '@/contexts/SongActionSheetContext';
import { usePlayingActions } from "@/contexts/PlayingContext";
import type { Song } from '@/domain/entities/Song';
import { useTranslation } from "react-i18next";
import { notify } from '@/components/toast';
import { usePlayableSongResolver } from '@/hooks/songs';
import { FULL_TRACK_FETCH_TIMEOUT_MS, TRACK_PRESS_COOLDOWN_MS } from '@/constants/playback';
import { formatDuration } from '@/utils/formatDuration';
import haptics from '@/utils/haptics';
import LibraryItem from './LibraryItem';

type Props = {
  song: Song;
  isGridView: boolean;
  gridWidth: number;
  gridSpacing?: number;
};

const TrackItem: React.FC<Props> = ({ song, isGridView, gridWidth, gridSpacing }) => {
  const { t } = useTranslation();
  const { playSimilar, playSong } = usePlayingActions();
  const { resolvePlayableSong } = usePlayableSongResolver();
  const { openSongOptions } = useSongActionSheets();

  const pressInFlightRef = useRef(false);
  const longPressInFlightRef = useRef(false);
  const lastPressAtRef = useRef(0);

  const handlePress = async () => {
    const now = Date.now();
    if (now - lastPressAtRef.current < TRACK_PRESS_COOLDOWN_MS) return;
    if (pressInFlightRef.current) return;
    lastPressAtRef.current = now;
    pressInFlightRef.current = true;
    try {
      // `resolvePlayableSong` (src/hooks/songs) is typed against the legacy
      // `@/types` Song/SongBase, not the domain `Song` this screen now has —
      // that hook is a different agent's scope. It documents a bare-id path
      // for exactly this case (looked up by `nativeId` — see its own
      // `selectSongsById` comment), so this passes the id rather than the
      // whole entity.
      const resolved = await resolvePlayableSong(song.nativeId, { timeoutMs: FULL_TRACK_FETCH_TIMEOUT_MS });
      if (!resolved) {
        notify.error(t("common.playbackError"));
        return;
      }
      if (resolved.filePath) {
        await playSong(resolved.song);
        return;
      }
      await new Promise<void>((resolve) =>
        InteractionManager.runAfterInteractions(() => resolve())
      );
      await playSimilar(resolved.song);
    } catch (error) {
      console.warn("Failed to play home track", error);
      notify.error(t("common.playbackError"));
    } finally {
      pressInFlightRef.current = false;
    }
  };

  const handleLongPress = async () => {
    if (longPressInFlightRef.current) return;
    longPressInFlightRef.current = true;
    haptics.heavy();
    try {
      // `resolvePlayableSong` (src/hooks/songs) is typed against the legacy
      // `@/types` Song/SongBase, not the domain `Song` this screen now has —
      // that hook is a different agent's scope. It documents a bare-id path
      // for exactly this case (looked up by `nativeId` — see its own
      // `selectSongsById` comment), so this passes the id rather than the
      // whole entity.
      const resolved = await resolvePlayableSong(song.nativeId, { timeoutMs: FULL_TRACK_FETCH_TIMEOUT_MS });
      if (resolved) {
        openSongOptions(resolved.song);
      } else {
        notify.error(t("common.songDetailsError"));
      }
    } catch (error) {
      console.warn("Failed to fetch full track data", error);
      notify.error(t("common.songDetailsError"));
    } finally {
      longPressInFlightRef.current = false;
    }
  };

  const duration = song.durationSeconds;
  const subtext = isGridView
    ? song.artist.name
    : `${song.artist.name}${duration ? ` • ${formatDuration(duration)}` : ""}`;

  return (
    <>
      <LibraryItem
        testID="library-track-item"
        cover={song.cover}
        title={song.title}
        subtext={subtext}
        isGridView={isGridView}
        gridWidth={gridWidth}
        gridSpacing={gridSpacing}
        onPress={() => { void handlePress(); }}
        onLongPress={() => { void handleLongPress(); }}
      />
    </>
  );
};

export default memo(TrackItem);
