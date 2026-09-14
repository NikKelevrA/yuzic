import React, { memo, useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Playlist } from '@/domain/entities/Playlist';
import PlaylistOptions from '@/components/options/PlaylistOptions';
import { useSheetRef } from '@/utils/useSheetRef';
import { prefetchCovers } from '@/utils/images/imageCache';
import LibraryItem from './LibraryItem';

interface ItemProps {
  playlist: Playlist;
  /** False on a screen of nothing but playlists, where "Playlist" under every
   *  title is the same word repeated — see `AlbumItem`'s `showTypeLabel`. */
  showTypeLabel?: boolean;
  isGridView: boolean;
  gridWidth: number;
  gridSpacing?: number;
}

const PlaylistItem: React.FC<ItemProps> = ({
  playlist,
  showTypeLabel = true,
  isGridView,
  gridWidth,
  gridSpacing,
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const sheetRef = useSheetRef();
  const [optionsMounted, setOptionsMounted] = useState(false);

  const handlePress = useCallback(() => {
    prefetchCovers([playlist.cover], 'detail');
    // Server adapter identity — the playlist screen resolves it by id.
    navigation.navigate('playlistView', { id: playlist.nativeId });
  }, [playlist, navigation]);

  const handleLongPress = useCallback(() => {
    if (!optionsMounted) {
      setOptionsMounted(true);
      requestAnimationFrame(() => sheetRef.current?.present());
    } else {
      sheetRef.current?.present();
    }
  }, [optionsMounted, sheetRef]);

  return (
    <>
      <LibraryItem
        testID="library-playlist-item"
        cover={playlist.cover}
        title={playlist.title}
        subtext={showTypeLabel ? t('playlist.subtext', { count: playlist.songIds.length }) : undefined}
        isGridView={isGridView}
        gridWidth={gridWidth}
        gridSpacing={gridSpacing}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
      {optionsMounted && <PlaylistOptions ref={sheetRef} playlist={playlist} />}
    </>
  );
};

export default memo(PlaylistItem);
