import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowDownAZ, CalendarPlus, Search } from 'lucide-react-native';

import { DetailHeaderBar } from '@/components/DetailHeader';
import EmptyState from '@/components/EmptyState';
import ListControls from '@/components/ListControls';
import WantsPickSheet, { type WantsPickOption } from './WantsFiltersSheet';
import { WantOptions } from '@/components/options/WantOptions';
import LibraryItem from '@/features/library/components/Items/LibraryItem';
import { gridItemWidth, libraryGutter, GRID_SPACING } from '@/features/library/layout';
import { useTheme } from '@/features/theme/useTheme';
import { useScrollClearance } from '@/features/theme/useScrollClearance';
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation';
import { iconSize } from '@/constants/design';
import {
  selectGridColumns,
  selectLibraryViewMode,
  setLibraryViewMode,
} from '@/features/settings/appearance/state';
import { selectWantsForActiveServer } from '@/state/redux/selectors/wantsSelectors';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { removeWant, type Want, type WantUnit } from '@/state/redux/slices/wantsSlice';
import WantRow from './WantRow';
import WantGetSheet from './WantGetSheet';
import { useWantRowStatus } from './useWantRowStatus';
import { wantAlbum, wantArtist } from './wantEntity';

/** How the list is ordered. Newest first is the useful default for a list you
 *  add to over time; A–Z is for finding one you know is in there. */
type WantSort = 'recentlyAdded' | 'title';

/** Which kinds are shown. `all` is not a unit — it is the absence of a filter. */
type WantFilter = 'all' | WantUnit;

/**
 * Wants: the things you have decided you want and do not have.
 *
 * Every row is live. Its artwork resolves through the app's one picture rule,
 * it opens the catalogue screen for what it names, and — where a downloader
 * is connected and has been asked — it says what that downloader is doing
 * with it.
 *
 * It wears the same controls as every library collection: an order, a filter
 * across the kinds it holds, and rows or a grid, remembered for this screen
 * the way each collection remembers its own. Rows are the default and the
 * reason is the status: "Downloading · 40%" belongs on a row, and a grid
 * caption has nowhere to put it — so the grid is there for scanning artwork
 * and the list for knowing where things stand.
 *
 * What it still does not do is acquire anything on its own. A want is an
 * intent, and turning one into a download takes a Get from the row's own "…"
 * and the confirm tap behind it.
 *
 * Wants are created by saving a *resolved* result — from Search, or a song's,
 * album's or artist's options — so this screen has no add control of its own.
 */
const WantsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch();
  const scrollClearance = useScrollClearance();
  const wants = useSelector(selectWantsForActiveServer);
  const activeServerId = useSelector(selectActiveServerId);
  const isGridView = useSelector(selectLibraryViewMode('wants'));
  const gridColumns = useSelector(selectGridColumns);
  const { width: screenWidth } = useWindowDimensions();
  const statusOf = useWantRowStatus();
  const { navigateToAlbum, navigateToArtist } = useMatchedNavigation();
  const [optionsFor, setOptionsFor] = useState<Want | null>(null);
  const [getFor, setGetFor] = useState<Want | null>(null);
  const [sort, setSort] = useState<WantSort>('recentlyAdded');
  const [filter, setFilter] = useState<WantFilter>('all');
  /**
   * Which picker is open, if either.
   *
   * State rather than a ref to a permanently-mounted sheet: this screen
   * re-renders behind its sheets — it reads the library index and the
   * downloader queue for every row's status — and a mounted modal
   * re-measuring mid-animation cancels its own dismissal, which is a sheet
   * that starts to close and springs back. Mounted only while open, there is
   * nothing to spring back.
   */
  const [picking, setPicking] = useState<'sort' | 'filter' | null>(null);

  const gutter = libraryGutter(isGridView, GRID_SPACING);
  const gridWidth = gridItemWidth(screenWidth, gridColumns, GRID_SPACING, gutter);

  /**
   * A chip per kind actually saved, never per kind that exists.
   *
   * A filter offering "Artists" to a list with no artists in it is a control
   * that can only ever empty the screen; `ListControls` drops the row
   * entirely when one kind is all there is, since filtering to it changes
   * nothing.
   */
  const filters = useMemo<WantsPickOption[]>(() => {
    const present = new Set(wants.map(want => want.unit));
    const rows: WantsPickOption[] = [{ value: 'all', label: t('common.all') }];
    if (present.has('album')) rows.push({ value: 'album', label: t('home.filters.albums') });
    if (present.has('artist')) rows.push({ value: 'artist', label: t('home.filters.artists') });
    if (present.has('track')) rows.push({ value: 'track', label: t('home.filters.tracks') });
    return rows;
  }, [wants, t]);

  /** What the filter pill says: the kind in force, or that nothing is filtered. */
  const filterLabel = filters.find(option => option.value === filter)?.label ?? t('common.all');

  const visible = useMemo(() => {
    const kept = filter === 'all' ? wants : wants.filter(want => want.unit === filter);
    // Sorted into a copy: the selector hands back the stored array, and
    // sorting it in place would reorder Redux's own state.
    return [...kept].sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : b.createdAt - a.createdAt
    );
  }, [wants, filter, sort]);

  const sortLabel = sort === 'title'
    ? t('home.sort.alphabetical')
    : t('home.sort.recentlyAdded');

  const sortOptions = useMemo<WantsPickOption[]>(() => [
    { value: 'recentlyAdded', label: t('home.sort.recentlyAdded'), Icon: CalendarPlus },
    { value: 'title', label: t('home.sort.alphabetical'), Icon: ArrowDownAZ },
  ], [t]);

  /**
   * Stable, so the picker sheet's props never change identity.
   *
   * An inline arrow here is a new function on every render, and this screen
   * re-renders on every downloader poll — which re-rendered the open sheet
   * and cancelled its own dismiss animation. See `WantsPickSheet`.
   */
  const closePicker = useCallback(() => setPicking(null), []);
  const selectSort = useCallback((value: string) => setSort(value as WantSort), []);
  const selectFilter = useCallback((value: string) => setFilter(value as WantFilter), []);

  const handleRemove = useCallback((want: Want) => {
    if (!activeServerId) return;
    dispatch(removeWant({ serverId: activeServerId, localId: want.localId }));
  }, [dispatch, activeServerId]);

  const goToSearch = useCallback(() => {
    router.navigate('/(home)/(tabs)/(search)');
  }, [router]);

  /**
   * Open what the want names, through the app's one external-resolution
   * path: it lands on the library's own copy where there is one, resolves
   * across every enabled source otherwise, and asks which when more than one
   * answers. A track opens the record it is on — a library track has no
   * screen of its own, and the album is the thing you came to look at.
   */
  const open = useCallback((want: Want) => {
    if (want.unit === 'artist') navigateToArtist(wantArtist(want));
    else navigateToAlbum(wantAlbum(want));
  }, [navigateToAlbum, navigateToArtist]);

  const renderItem = useCallback(
    ({ item }: { item: Want }) => (
      isGridView ? (
        <LibraryItem
          testID="want-grid-item"
          cover={item.cover ?? { kind: 'none' }}
          title={item.title}
          subtext={item.unit === 'artist' ? t('wants.artistLabel') : item.artist}
          // An artist is a circle at every radius preset — it is how you tell
          // one from a record at a glance, here as in the library.
          circularImage={item.unit === 'artist'}
          isGridView
          gridWidth={gridWidth}
          gridSpacing={GRID_SPACING}
          onPress={() => open(item)}
          onLongPress={() => setOptionsFor(item)}
        />
      ) : (
        <WantRow
          want={item}
          status={statusOf(item)}
          onPress={() => open(item)}
          onOptions={() => setOptionsFor(item)}
        />
      )
    ),
    [isGridView, gridWidth, statusOf, open, t]
  );

  return (
    <SafeAreaView testID="wants-screen" edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <DetailHeaderBar
        title={t('wants.title')}
        subtitle={wants.length > 0 ? t('library.count.items', { count: wants.length }) : undefined}
      />
      {wants.length === 0 ? (
        <EmptyState
          icon={<Search size={iconSize.emptyState} color={colors.subtext} />}
          message={t('wants.empty')}
          action={{ label: t('wants.searchAction'), onPress: goToSearch }}
        />
      ) : (
        <FlatList
          // Changing the column count needs a new list; FlatList keeps the
          // old layout otherwise.
          key={isGridView ? `grid-${gridColumns}` : 'list'}
          data={visible}
          keyExtractor={(item) => item.localId}
          numColumns={isGridView ? gridColumns : 1}
          renderItem={renderItem}
          ListHeaderComponent={
            // The gutter is sized for the items; the controls above them keep
            // the app's own page inset, so give that back before it is
            // applied twice.
            <View style={{ marginHorizontal: -gutter }}>
              <ListControls
                sortLabel={sortLabel}
                onSortPress={() => setPicking('sort')}
                isGridView={isGridView}
                onToggleView={() => dispatch(
                  setLibraryViewMode({ collection: 'wants', isGridView: !isGridView })
                )}
                // One kind is not a choice: filtering to it changes nothing,
                // so the control stays away until there is something to pick.
                filterLabel={filters.length > 1 ? filterLabel : undefined}
                onFilterPress={filters.length > 1 ? () => setPicking('filter') : undefined}
              />
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: scrollClearance }}
        />
      )}

      {/* Each mounted only while it is open — the sheet presents itself and
          reports its own dismissal. See `WantsPickSheet`. */}
      {picking === 'sort' && (
        <WantsPickSheet
          testID="wants-sort-sheet"
          title={t('home.sortSheet.title')}
          selected={sort}
          options={sortOptions}
          onSelect={selectSort}
          onClose={closePicker}
        />
      )}

      {picking === 'filter' && (
        <WantsPickSheet
          testID="wants-filters-sheet"
          title={t('wants.filters.title')}
          selected={filter}
          options={filters}
          onSelect={selectFilter}
          onClose={closePicker}
        />
      )}

      {optionsFor && (
        <WantOptions
          want={optionsFor}
          status={statusOf(optionsFor)}
          onClose={() => setOptionsFor(null)}
          onOpen={() => open(optionsFor)}
          onGet={() => setGetFor(optionsFor)}
          onSearch={goToSearch}
          onRemove={() => handleRemove(optionsFor)}
        />
      )}

      {/* Album and track Gets go through the app's normal review sheet; an
          artist Get is dispatched from the options sheet itself, since there
          is no release to review. */}
      {getFor && getFor.unit !== 'artist' && (
        <WantGetSheet want={getFor} onClose={() => setGetFor(null)} />
      )}
    </SafeAreaView>
  );
};

export default WantsScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
