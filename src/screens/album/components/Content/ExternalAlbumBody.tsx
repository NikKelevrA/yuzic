import React, { useCallback, useMemo } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';

import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import { formatDuration } from '@/utils/formatDuration';
import AlbumHeader, { AlbumHeaderBar } from '../Header';
import SongRow from '@/components/rows/SongRow';
import { useExternalAlbumPreviews } from '@/hooks/albums/useExternalAlbumPreviews';
import { usePreviewPlayer } from '@/hooks/usePreviewPlayer';
import { useTheme } from '@/hooks/useTheme';
import { ALBUM_EXTERNAL_HORIZONTAL_PADDING } from '@/constants/features';
import { spacing, typography } from '@/constants/design';
import { DetailScreen } from '@/components/DetailHeader';
import { useScrollClearance } from '@/hooks/useScrollClearance';

type Props = {
  album: Album;
  songs: Song[];
};

const ExternalAlbumBody: React.FC<Props> = ({ album, songs }) => {
  const { colors } = useTheme();
  const scrollClearance = useScrollClearance();
  const previews = useExternalAlbumPreviews(album, songs);
  const { toggleInAlbum } = usePreviewPlayer();

  // `streamId` carries the preview URL — see the equivalent comment in
  // `../Header`'s `ExternalActionRow`.
  const albumPreviewSongs = useMemo(() =>
    songs
      .filter(s => !!previews[s.nativeId])
      .map(s => ({ ...s, streamId: previews[s.nativeId] })),
    [previews, songs]
  );

  const handleSongPress = useCallback((song: Song) => {
    const url = previews[song.nativeId];
    if (!url) return;
    toggleInAlbum(song, url, albumPreviewSongs, album.nativeId, album.title);
  }, [previews, albumPreviewSongs, toggleInAlbum, album.nativeId, album.title]);

  const footer = useMemo(() => {
    const totalSec = songs.reduce((acc, s) => acc + s.durationSeconds, 0);
    const label = songs.length === 1 ? 'song' : 'songs';
    return (
      <View style={styles.statsFooter}>
        <Text style={[styles.statsText, { color: colors.subtext }]}>
          {songs.length} {label} · {formatDuration(totalSec)}
        </Text>
      </View>
    );
  }, [songs, colors]);

  const renderItem = useCallback(({ item }: { item: Song }) => {
    const previewUrl = previews[item.nativeId];
    return (
      <SongRow
        song={item}
        albumTitle={album.title}
        albumArtist={album.artist.name}
        previewUrl={previewUrl}
        onPress={previewUrl ? () => handleSongPress(item) : undefined}
      />
    );
  }, [previews, handleSongPress, album.title, album.artist]);

  return (
    <DetailScreen bar={<AlbumHeaderBar localAlbum={null} externalAlbum={album} />}>
      {scroll => (
      <FlashList
        data={songs}
        keyExtractor={(item) => item.localId}
        renderItem={renderItem}
        extraData={handleSongPress}
        ListHeaderComponent={<AlbumHeader localAlbum={null} externalAlbum={album} externalSongs={songs} showNavigation={false} />}
        ListFooterComponent={footer}
        contentContainerStyle={{ paddingBottom: scrollClearance }}
        showsVerticalScrollIndicator={false}
        {...scroll}
      />
      )}
    </DetailScreen>
  );
};

const styles = StyleSheet.create({
  statsFooter: {
    paddingHorizontal: ALBUM_EXTERNAL_HORIZONTAL_PADDING,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  statsText: {
    ...typography.caption,
  },
});

export default ExternalAlbumBody;
