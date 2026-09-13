import React, { memo, useCallback, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { Artist } from '@/domain/entities/Artist';
import ArtistOptions from '@/components/options/ArtistOptions';
import { useSheetRef } from '@/utils/useSheetRef';
import { prefetchCovers } from '@/utils/images/imageCache';
import LibraryItem from './LibraryItem';

interface ItemProps {
  artist: Artist;
  /** False on a screen of nothing but artists, where "Artist" under every
   *  name is the same word repeated — see `AlbumItem`'s `showTypeLabel`. */
  showTypeLabel?: boolean;
  isGridView: boolean;
  gridWidth: number;
  gridSpacing?: number;
}

const ArtistItem: React.FC<ItemProps> = ({
  artist,
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
    prefetchCovers([artist.cover], 'detail');
    // Server adapter identity — becomes `useArtist(id)` -> `api.artists.get(id)`.
    navigation.navigate('artistView', { id: artist.nativeId });
  }, [artist, navigation]);

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
        testID="library-artist-item"
        // The name as its own addressable id. Every cell otherwise shares one
        // testID and the name is only a `title` prop, so a specific artist can
        // only be reached by `text:` — which is layout-dependent: the iPad
        // grid is three across, and scrollUntilVisible steps a whole row at a
        // time, so it scrolls clean past the wanted name to the end of the
        // list without ever matching it.
        titleTestID={`library-artist-item-${artist.name}`}
        cover={artist.cover}
        title={artist.name}
        subtext={showTypeLabel ? t('common.artist') : undefined}
        isGridView={isGridView}
        gridWidth={gridWidth}
        gridSpacing={gridSpacing}
        circularImage
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
      {optionsMounted && <ArtistOptions ref={sheetRef} artist={artist} hideGoToArtist={false} />}
    </>
  );
};

export default memo(ArtistItem);
