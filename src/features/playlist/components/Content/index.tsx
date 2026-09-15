import React, { useCallback, useMemo, useRef, useState } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useTranslation } from 'react-i18next';

import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import SongRow from '@/components/rows/SongRow';
import LoadingSongRow from '@/components/rows/SongRow/Loading';
import SectionEmptyState from '@/features/home/components/SectionEmptyState';
import { useStarredSongs } from '@/features/library/useStarredSongs';

import Header, { PlaylistHeaderBar } from '../Header';
import RecommendedSection from '../RecommendedSection';
import PlaylistEditList from '../EditList';
import PlaylistOptions from '@/components/options/PlaylistOptions';
import { DetailScreen } from '@/components/DetailHeader';
import { useScrollClearance } from '@/features/theme/useScrollClearance';

type Props = {
  playlist: Playlist;
  songs: Song[];
  songsLoading?: boolean;
};

type SongItem = { type: 'song'; song: Song };
type SkeletonItem = { type: 'skeleton'; id: string };
type ListItem = SongItem | SkeletonItem;

const PlaylistContent: React.FC<Props> = ({ playlist, songs, songsLoading }) => {
  const scrollClearance = useScrollClearance();
  const { t } = useTranslation();
  const { songs: starredSongs } = useStarredSongs();
  const optionsRef = useRef<BottomSheetModal>(null);
  const [editing, setEditing] = useState(false);
  const startEditing = useCallback(() => setEditing(true), []);
  const stopEditing = useCallback(() => setEditing(false), []);
  const starredSongIds = useMemo(
    () => new Set(starredSongs.map(song => song.localId)),
    [starredSongs]
  );
  const items = useMemo<ListItem[]>(() => {
    if (songsLoading) {
      return Array.from({ length: 8 }, (_, i) => ({ type: 'skeleton' as const, id: `sk-${i}` }));
    }

    return songs.map(song => ({ type: 'song', song }));
  }, [songs, songsLoading]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'skeleton') {
      return <LoadingSongRow />;
    }

    return (
      <SongRow
        song={item.song}
        collection={{ playlist, songs }}
        showDownloadedDot
        isFavorite={starredSongIds.has(item.song.localId)}
      />
    );
  }, [starredSongIds, playlist, songs]);

  if (editing && !songsLoading) {
    return <PlaylistEditList playlist={playlist} songs={songs} onDone={stopEditing} />;
  }

  return (
    <DetailScreen
      bar={<PlaylistHeaderBar playlist={playlist} onOptions={() => optionsRef.current?.present()} />}
    >
      {scroll => (
        <>
      <FlashList<ListItem>
        data={items}
        keyExtractor={(item, index) => item.type === 'song' ? `${item.song.localId}:${index}` : item.id}
        renderItem={renderItem}
        ListHeaderComponent={<Header playlist={playlist} songs={songs} showNavigation={false} onOptions={() => optionsRef.current?.present()} />}
        ListFooterComponent={<RecommendedSection playlist={playlist} songs={songs} />}
        ListEmptyComponent={songsLoading ? null : <SectionEmptyState message={t('playlist.empty')} />}
        contentContainerStyle={{ paddingBottom: scrollClearance }}
        showsVerticalScrollIndicator={false}
        {...scroll}
      />
      <PlaylistOptions ref={optionsRef} playlist={playlist} hideGoToPlaylist onEditSongs={startEditing} />
        </>
      )}
    </DetailScreen>
  );
};

export default PlaylistContent;
