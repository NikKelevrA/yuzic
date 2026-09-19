import React, { useCallback, useMemo } from 'react';
import { View, ScrollView, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useAlbums } from '@/features/album/useAlbums';
import AlbumItem from '@/features/library/components/Items/AlbumItem';
import { usePrefetchCovers } from '@/features/library/usePrefetchCovers';
import { entityKey } from '@/features/listening/listenerKey';
import { useListenerModel } from '@/features/listening/useListenerModel';
import SectionShelfHeader from '../SectionShelfHeader';
import { sectionStyles, getSectionItemWidth } from '../sectionStyles';
import { useStableList } from '../../hooks/useStableList';

/**
 * Records the listener loved and stopped playing.
 *
 * The one shelf on this screen a streaming service could not build. Every
 * other kind of recommendation needs a catalogue to search; this needs a long
 * tail the listener already owns and a history of them loving it, and Spotify
 * has neither. It is also the answer to the complaint collectors make about
 * their own libraries — that play counts pile onto a handful of records while
 * most of what they chose is never opened again.
 *
 * Ranked by `dormancy`: past affection multiplied by how long since. That is
 * deliberately *not* "albums you have not played", which would surface
 * everything you have never opened and mostly read as noise. Something has to
 * have been loved before it can be missed.
 *
 * Only shown once the history is worth trusting — `informed` — because a shelf
 * called "set aside" drawn from three listens is a guess wearing a fact's
 * clothes.
 */
const MIN_ALBUMS = 4;
const MAX_ALBUMS = 10;

export default function SetAsideAlbums() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const gridItemWidth = getSectionItemWidth(width);
  const listener = useListenerModel();
  const { albums } = useAlbums();

  // Stable while the same albums are listed in the same order: the history
  // behind them moves at the end of every song. See `useStableList`.
  const itemsToRender = useStableList(useMemo(() => {
    if (!listener.informed) return [];
    return listener.order(albums, entityKey, 'rediscover', {
      scope: 'album',
      limit: MAX_ALBUMS,
    });
  }, [listener, albums]));

  const coversToPrefetch = useMemo(() => itemsToRender.map(a => a.cover), [itemsToRender]);
  usePrefetchCovers(coversToPrefetch, 'grid');

  // There is no sort order that expresses "loved and dropped", so the heading
  // leads to the closest honest thing: the albums list by when it was last
  // played, oldest first, which is the same question asked coarsely.
  const openAll = useCallback(
    () => navigation.push('libraryCollectionView', {
      type: 'albums',
      sort: 'userlastplayed',
    }),
    [navigation]
  );

  // A shelf of two is not worth the room it takes, and on a young library
  // there genuinely is nothing to say yet.
  if (itemsToRender.length < MIN_ALBUMS) return null;

  return (
    <View style={sectionStyles.container}>
      <SectionShelfHeader
        testID="home-set-aside-see-all"
        title={t('explore.sections.setAside')}
        seeAllLabel={t('library.seeAll')}
        onSeeAll={openAll}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={sectionStyles.scrollContent}
      >
        {itemsToRender.map(album => (
          <View key={album.localId} style={[sectionStyles.item, { width: gridItemWidth }]}>
            <AlbumItem album={album} isGridView gridWidth={gridItemWidth} gridSpacing={0} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
