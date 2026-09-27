/**
 * The Search screen's one view model — every piece of state, effect, and
 * handler the screen needs, so `SearchScreen.tsx` itself is JSX plus styling.
 *
 * Owns the debounced query, the Library-XOR-Other-sources scope, the Filters
 * sheet selections, and the handlers that record/replay/navigate to a
 * result. Delegates *what* gets searched to `useSearch()`
 * (`src/features/search/SearchContext.tsx`) and *what gets recorded* to
 * `useSearchHistory` (`./searchHistory.ts`); this hook is the glue between
 * them and the screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Keyboard } from 'react-native';
import type { TextInput } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { type SearchResult, useSearch, type SearchEntityType } from '@/features/search/SearchContext';
import {
  selectResultScope,
  selectSearchEntityTypes,
  selectSearchSourceIds,
  setResultScope as setResultScopeAction,
  setSearchEntityTypes,
  setSearchSourceIds,
} from '@/features/settings/search/state';
import type { SearchResultScope } from '@/features/search/searchLegs';
import { } from '@/features/search/searchPolicy';
import { useSearchHistory } from '@/features/search/searchHistory';
import { entityToAlbum, entityToArtist } from '@/features/search/searchResultAdapters';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { useSongActionSheets } from '@/features/entity-actions/SongActionSheetContext';
import { notify } from '@/components/toast';
import { usePrefetchCovers } from '@/features/library/usePrefetchCovers';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { selectShowSourceHeaders } from '@/features/settings/appearance/state';
import { selectActiveServer, selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import type { SearchEntityEntry } from '@/state/redux/slices/searchHistorySlice';
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation';
import { useEnabledSearchSourceIds } from '@/features/sources/useSearchSourcesEnabled';
import { useAccountSheet } from '@/features/settings/AccountSheetContext';

export function useSearchScreenModel() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { navigateToAlbum, navigateToArtist } = useMatchedNavigation();
  const { playSong } = usePlayingActions();
  const { resolvePlayableSong } = usePlayableSongResolver();
  const { openSongOptions } = useSongActionSheets();
  const { openAccountSheet } = useAccountSheet();

  // Sources the user has turned on FOR SEARCH — independent of Home/discovery
  // enablement. Nothing here is ever implied by a Home toggle.
  const enabledSearchSourceIds = useEnabledSearchSourceIds();
  const showSourceHeaders = useSelector(selectShowSourceHeaders);
  const username = useSelector(selectActiveServer)?.username;
  const activeServerId = useSelector(selectActiveServerId);

  const history = useSearchHistory(activeServerId ?? undefined);
  const { searchResults, handleSearchWithFilters, clearSearch, isLoading, hasError, degraded } = useSearch();

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  // 'library' is the default and the only scope that ever runs without an
  // explicit switch — "Other sources" is the deliberate external action.
  // The filters live in settings, not here. As local state they were forgotten
  // every time the screen unmounted, so a chosen scope and set of sources came
  // back as "Library, everything" without saying so.
  const dispatch = useDispatch();
  const resultScope = useSelector(selectResultScope);
  const storedSourceIds = useSelector(selectSearchSourceIds);
  const selectedEntityTypes = useSelector(selectSearchEntityTypes);

  // Null means "whichever sources are enabled", so a source switched on after
  // the choice was made is included rather than left out by a stale list.
  const selectedSourceIds = useMemo(
    () => (storedSourceIds ?? enabledSearchSourceIds).filter(id => enabledSearchSourceIds.includes(id as never)),
    [storedSourceIds, enabledSearchSourceIds]
  );

  const setResultScope = useCallback(
    (scope: SearchResultScope) => { dispatch(setResultScopeAction(scope)); },
    [dispatch]
  );

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the scope/filter selections: `runSearch` is stable across
  // re-renders it doesn't need to react to, but still has to read the current
  // selection when the debounce or a submit fires.
  const scopeRef = useRef(resultScope);
  scopeRef.current = resultScope;
  const selectedSourceIdsRef = useRef(selectedSourceIds);
  selectedSourceIdsRef.current = selectedSourceIds;
  const selectedEntityTypesRef = useRef(selectedEntityTypes);
  selectedEntityTypesRef.current = selectedEntityTypes;

  /**
   * Searching or browsing — the tab's two states, and the one thing that
   * decides what the body shows.
   *
   * This used to be the field's focus, which made the keyboard the source of
   * truth and produced a screen with no stable state: dismissing the keyboard
   * to read the recents underneath replaced them with the browse grid, and
   * scrolling results did the same thing (`keyboardDismissMode="on-drag"`
   * blurs the field), so the tab flipped between two layouts while the user
   * was reading one of them.
   *
   * Searching is entered by tapping the field and left only on purpose —
   * Cancel, or Android back. A blur no longer leaves it, so the keyboard can
   * come and go underneath one steady screen. A non-empty query counts as
   * searching by itself, so a restored or programmatic query can never land
   * on the browse grid with results behind it.
   *
   * The tab still opens quietly on browse rather than forcing the keyboard
   * up: arriving at Search often means browsing, and half the screen was
   * gone before anything had been looked at.
   */
  const searchInputRef = useRef<TextInput>(null);
  const [isSearchingState, setIsSearchingState] = useState(false);
  const isSearching = isSearchingState || query.trim() !== '';
  const enterSearch = useCallback(() => setIsSearchingState(true), []);

  /**
   * Back to browsing: keyboard away, query gone, results dropped.
   *
   * The scope and the Filters selections are deliberately left alone. They
   * are the user's standing choice about where to search, kept in settings
   * for exactly that reason — leaving the search state is not a request to
   * forget it.
   */
  const exitSearch = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    setQuery('');
    clearSearch();
    setHasSearched(false);
    setIsSearchingState(false);
  }, [clearSearch]);

  // Android's back gesture leaves the search state before it leaves the tab,
  // the same way it closes a sheet first. Registered only while searching, so
  // browsing keeps the system default.
  useFocusEffect(
    useCallback(() => {
      if (!isSearching) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        exitSearch();
        return true;
      });
      return () => subscription.remove();
    }, [isSearching, exitSearch])
  );

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  // A source that stops being enabled for search (disabled in Settings, or
  // the device going offline) drops out of the current selection too, so a
  // stale id never reaches `handleSearchWithFilters`. A newly-enabled source
  // is not auto-selected, so a user who narrowed the Filters sheet on purpose
  // doesn't have that choice silently widened out from under them — except
  // when it was switched on from that sheet, which selects it itself.
  const runSearch = useCallback((text: string) => {
    clearSearch();
    setHasSearched(true);
    void handleSearchWithFilters(text, {
      resultScope: scopeRef.current,
      sourceIds: selectedSourceIdsRef.current,
      entityTypes: selectedEntityTypesRef.current,
    });
  }, [clearSearch, handleSearchWithFilters]);

  // Switching scope (or the filters underneath "Other sources") re-runs the
  // current query immediately rather than waiting for the next keystroke —
  // otherwise flipping to "Other sources" would show stale library results
  // (or nothing) until the user typed again.
  useEffect(() => {
    if (query.trim() === '') return;
    runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultScope, selectedSourceIds.join(','), selectedEntityTypes.join(',')]);

  const onSearchChange = (text: string) => {
    setQuery(text);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (!text.trim()) {
      clearSearch();
      setHasSearched(false);
      return;
    }
    typingTimeoutRef.current = setTimeout(() => runSearch(text), 300);
  };

  const clearQuery = () => {
    setQuery('');
    clearSearch();
    setHasSearched(false);
  };

  const onSearchSubmit = () => {
    Keyboard.dismiss();
    history.recordSearch(query);
  };

  const handleRecentPress = (value: string) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    Keyboard.dismiss();
    setQuery(value);
    runSearch(value);
    history.recordSearch(value);
  };

  const handleRecentSongPress = async (entity: SearchEntityEntry) => {
    try {
      const resolved = await resolvePlayableSong(entity.id);
      if (resolved) await playSong(resolved.song);
      else notify.error(t('common.playbackError'));
    } catch {
      notify.error(t('common.playbackError'));
    }
  };

  // Recent entities navigate straight to the item — no round-trip through search.
  const handleRecentEntityPress = (entity: SearchEntityEntry) => {
    Keyboard.dismiss();
    history.recordEntity(entity);

    if (entity.type === 'song') {
      void handleRecentSongPress(entity);
      return;
    }
    if (entity.type === 'album') {
      if (entity.source === 'external') navigateToAlbum(entityToAlbum(entity));
      else navigation.navigate('albumView', { id: entity.id });
      return;
    }
    if (entity.type === 'artist') {
      if (entity.source === 'external') navigateToArtist(entityToArtist(entity));
      else navigation.navigate('artistView', { id: entity.id });
      return;
    }
    navigation.navigate('playlistView', { id: entity.id });
  };

  /** Every result row calls this on selection, before its own navigation —
   *  the one place a result is recorded to history. */
  const selectResult = useCallback((result: SearchResult) => {
    history.recordResult(query, result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const onSongPress = async (result: SearchResult) => {
    selectResult(result);
    try {
      // `SearchResult.song` is never populated for a library match any more
      // (it would need a credentialled stream URL nobody has asked for yet),
      // so this always resolves by id, same as any result that arrives
      // without one.
      const resolved = await resolvePlayableSong(result.id);
      if (resolved) await playSong(resolved.song);
      else notify.error(t('common.playbackError'));
    } catch {
      notify.error(t('common.playbackError'));
    }
  };

  const onSongOptions = async (result: SearchResult) => {
    try {
      const resolved = await resolvePlayableSong(result.id);
      if (resolved) openSongOptions(resolved.song);
      else notify.error(t('common.songDetailsError'));
    } catch {
      notify.error(t('common.songDetailsError'));
    }
  };

  // The library scope only ever contains local results, and "Other sources"
  // only ever contains external ones — `resultScope` already kept the fetch
  // itself from mixing the two (see `planSearchLegs`), and this keeps the
  // render from doing it either, belt and suspenders against a stray result
  // slipping in from a stale request.
  const isOtherScope = resultScope === 'other';
  const libraryResults = useMemo(
    () => (isOtherScope ? [] : searchResults.filter(r => r.source === 'local')),
    [searchResults, isOtherScope]
  );

  // Group external results by their source so each gets its own labelled,
  // provenance-tagged section — never merged into one undifferentiated list,
  // and never merged with the library results above.
  const externalResultsBySource = useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    if (!isOtherScope) return groups;
    for (const r of searchResults) {
      if (r.source !== 'external' || !r.externalSource) continue;
      const existing = groups.get(r.externalSource);
      if (existing) existing.push(r);
      else groups.set(r.externalSource, [r]);
    }
    return groups;
  }, [searchResults, isOtherScope]);

  const coversToPrefetch = useMemo(() => searchResults.slice(0, 18).map(r => r.cover), [searchResults]);
  usePrefetchCovers(coversToPrefetch, 'thumb');

  const toggleFilterSource = useCallback((sourceId: string) => {
    dispatch(setSearchSourceIds(
      selectedSourceIds.includes(sourceId)
        ? selectedSourceIds.filter(id => id !== sourceId)
        : [...selectedSourceIds, sourceId]
    ));
  }, [dispatch, selectedSourceIds]);

  const toggleFilterEntityType = useCallback((entityType: SearchEntityType) => {
    dispatch(setSearchEntityTypes(
      selectedEntityTypes.includes(entityType)
        ? selectedEntityTypes.filter(type => type !== entityType)
        : [...selectedEntityTypes, entityType]
    ));
  }, [dispatch, selectedEntityTypes]);

  const noResultsForScope = query.trim() !== '' && hasSearched && !isLoading
    && (isOtherScope ? externalResultsBySource.size === 0 : libraryResults.length === 0);

  return {
    // navigation / identity
    navigation, navigateToAlbum, navigateToArtist, username, openAccountSheet,
    activeServerId: activeServerId ?? undefined,
    // query state
    query, onSearchChange, onSearchSubmit, clearQuery, searchInputRef,
    isSearching, enterSearch, exitSearch,
    // scope / filters
    resultScope, setResultScope, enabledSearchSourceIds,
    selectedSourceIds, selectedEntityTypes, toggleFilterSource, toggleFilterEntityType,
    isOtherScope, showSourceHeaders,
    // results
    hasSearched, isLoading, hasError, degraded,
    libraryResults, externalResultsBySource, noResultsForScope,
    // history
    recentQueries: history.recentQueries,
    recentEntities: history.recentEntities,
    onRecentQueryPress: handleRecentPress,
    onRecentEntityPress: handleRecentEntityPress,
    onRemoveRecent: history.removeEntry,
    onClearRecent: history.clear,
    // result actions
    selectResult, onSongPress, onSongOptions,
  };
}
