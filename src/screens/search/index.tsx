import { hitSlopFor, iconSize, onDark, spacing, typography } from '@/constants/design';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Keyboard,
  ScrollView,
  Text,
} from 'react-native';
import { CloudOff, Ellipsis, SlidersHorizontal, Search as SearchIcon, X } from 'lucide-react-native';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';

import { SearchResult, useSearch, ALL_SEARCH_ENTITY_TYPES, type SearchEntityType } from '@/contexts/SearchContext';
import type { SearchResultScope } from '@/contexts/searchLegs';
import type { CoverSource } from '@/types/Cover';
import type { Album } from '@/domain/entities/Album';
import type { Artist } from '@/domain/entities/Artist';
import type { Playlist } from '@/domain/entities/Playlist';
import { makeLocalId } from '@/domain/identity/LocalId';
import { normalizeExternalIds } from '@/domain/identity/ExternalIds';
import { integrationProvenance, serverProvenance } from '@/domain/identity/Provenance';
import AlbumRow, { isExternalAlbum } from '@/components/rows/AlbumRow';
import ArtistRow from '@/components/rows/ArtistRow';
import PlaylistRow from '@/components/rows/PlaylistRow';
import SkeletonListRow from '@/components/SkeletonListRow';
import StatusBanner from '@/components/StatusBanner';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { usePlayingActions } from '@/contexts/PlayingContext';
import IconActionButton from '@/components/IconActionButton';
import MediaListRow from '@/components/MediaListRow';
import { useSongActionSheets } from '@/contexts/SongActionSheetContext';
import { notify } from '@/components/toast';
import { usePrefetchCovers } from '@/hooks/usePrefetchCovers';
import { prefetchCovers } from '@/utils/images/imageCache';
import { usePlayableSongResolver } from '@/hooks/songs';
import { useDispatch, useSelector } from 'react-redux';
import { selectShowSourceHeaders } from '@/utils/redux/selectors/settingsSelectors';
import { selectActiveServer, selectActiveServerId } from '@/utils/redux/selectors/serversSelectors';
import {
  selectRecentSearchEntities,
  selectRecentSearchQueries,
} from '@/utils/redux/selectors/searchHistorySelectors';
import {
  addSearchQuery,
  addSearchEntity,
  removeSearchEntry,
  clearSearchHistory,
  type SearchEntityEntry,
} from '@/utils/redux/slices/searchHistorySlice';
import RecentSearches from './components/RecentSearches';
import SearchFiltersSheet from './components/SearchFiltersSheet';
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation';
import { getSourceMeta } from '@/features/sources/registry';
import { useEnabledSearchSourceIds } from '@/features/sources/useSearchSourcesEnabled';
import TabHeader from '@/components/TabHeader';
import { useAccountSheet } from '@/contexts/AccountSheetContext';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/hooks/useRadius';
import { useScrollClearance } from '@/hooks/useScrollClearance';

/**
 * `SearchResult` (src/contexts/SearchContext.tsx, out of scope) is a
 * display-flattened aggregate across all four entity kinds, not a domain
 * entity itself — it has no `localId`/`provenance` of its own. `ArtistRow`/
 * `PlaylistRow`/`AlbumRow` (src/components/rows) all require a real domain
 * `Artist`/`Playlist`/`Album`, so these rebuild one from the result's fields,
 * the same way `resourceFromPlayerItem` rebuilds refs from a bare id.
 */
function searchResultToArtist(result: SearchResult, activeServerId: string | undefined): Artist {
  const provenance = result.source === 'external'
    ? integrationProvenance(result.externalSource ?? 'unknown')
    : serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('artist', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: normalizeExternalIds(result.externalIds),
    libraryState: result.source === 'external'
      ? (result.isDownloaded ? 'in-library' : 'external')
      : 'in-library',
    name: result.title,
    cover: result.cover,
    tags: [],
    albumIds: [],
  };
}

/**
 * A domain `Album`/`Artist` for an external (Deezer/MusicBrainz/Last.fm)
 * result — `AlbumRow`/navigation now require the single domain type, so this
 * is built inline from whatever loose id/title/cover fields the caller has
 * (a `SearchResult` row or a persisted `SearchEntityEntry`), the same way
 * `searchResultToArtist` rebuilds a local one.
 */
function externalAlbumFrom(input: {
  id: string;
  title: string;
  artistName: string;
  cover: CoverSource;
  externalSource?: string;
  externalIds?: unknown;
}): Album {
  const provenance = integrationProvenance(input.externalSource ?? 'unknown');
  return {
    localId: makeLocalId('album', provenance, input.id),
    nativeId: input.id,
    provenance,
    externalIds: normalizeExternalIds(input.externalIds),
    libraryState: 'external',
    title: input.title,
    cover: input.cover,
    artist: {
      localId: makeLocalId('artist', provenance, ''),
      nativeId: '',
      externalIds: {},
      name: input.artistName,
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

function externalArtistFrom(input: {
  id: string;
  name: string;
  cover: CoverSource;
  externalSource?: string;
  externalIds?: unknown;
}): Artist {
  const provenance = integrationProvenance(input.externalSource ?? 'unknown');
  return {
    localId: makeLocalId('artist', provenance, input.id),
    nativeId: input.id,
    provenance,
    externalIds: normalizeExternalIds(input.externalIds),
    libraryState: 'external',
    name: input.name,
    cover: input.cover,
    tags: [],
    albumIds: [],
  };
}

/** For a local (library) album result. */
function searchResultToLocalAlbum(result: SearchResult, activeServerId: string | undefined): Album {
  const provenance = serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('album', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: normalizeExternalIds(result.externalIds),
    libraryState: 'in-library',
    title: result.title,
    cover: result.cover,
    artist: {
      localId: makeLocalId('artist', provenance, ''),
      nativeId: '',
      externalIds: {},
      name: result.subtext,
      cover: { kind: 'none' },
    },
    releaseType: 'album',
    genres: [],
    songIds: [],
  };
}

function searchResultToPlaylist(result: SearchResult, activeServerId: string | undefined): Playlist {
  const provenance = serverProvenance(activeServerId ?? '');
  return {
    localId: makeLocalId('playlist', provenance, result.id),
    nativeId: result.id,
    provenance,
    externalIds: {},
    libraryState: 'in-library',
    title: result.title,
    cover: result.cover,
    isOwned: true,
    songIds: [],
  };
}

const Search = () => {
  const searchInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const filtersSheetRef = useRef<BottomSheetModal>(null);
  useScrollToTop(scrollRef);
  const { openSongOptions } = useSongActionSheets();
  const navigation = useNavigation<any>();
  const { navigateToAlbum, navigateToArtist } = useMatchedNavigation();
  const { t } = useTranslation();
  const scrollClearance = useScrollClearance();
  const { colors } = useTheme();
  const rad = useRadius();
  const dispatch = useDispatch();
  const { playSong } = usePlayingActions();
  const { resolvePlayableSong } = usePlayableSongResolver();
  // Sources the user has turned on FOR SEARCH — independent of Home/discovery
  // enablement. Nothing here is ever implied by a Home toggle.
  const enabledSearchSourceIds = useEnabledSearchSourceIds();
  const showSourceHeaders = useSelector(selectShowSourceHeaders);
  const username = useSelector(selectActiveServer)?.username;
  const activeServerId = useSelector(selectActiveServerId);
  const recentQueries = useSelector(selectRecentSearchQueries);
  const recentEntities = useSelector(selectRecentSearchEntities);
  const { openAccountSheet } = useAccountSheet();

  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  // 'library' is the default and the only scope that ever runs without an
  // explicit switch — "Other sources" is the deliberate external action.
  const [resultScope, setResultScope] = useState<SearchResultScope>('library');
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(enabledSearchSourceIds);
  const [selectedEntityTypes, setSelectedEntityTypes] = useState<SearchEntityType[]>(ALL_SEARCH_ENTITY_TYPES);
  const { searchResults, handleSearchWithFilters, clearSearch, isLoading, hasError, degraded } = useSearch();

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `query` for the focus effect, which must not be re-created on every
  // keystroke but still needs to read the current value.
  const queryRef = useRef(query);
  queryRef.current = query;

  // Mirrors scope/filter selections for the same reason `queryRef` exists:
  // `runSearch` is stable across re-renders it doesn't need to react to, but
  // still has to read the current selection when the debounce/submit fires.
  const scopeRef = useRef(resultScope);
  scopeRef.current = resultScope;
  const selectedSourceIdsRef = useRef(selectedSourceIds);
  selectedSourceIdsRef.current = selectedSourceIds;
  const selectedEntityTypesRef = useRef(selectedEntityTypes);
  selectedEntityTypesRef.current = selectedEntityTypes;

  /**
   * Open the keyboard when the tab is opened with nothing typed.
   *
   * Arriving at Search means intending to type, and the tab used to land on a
   * field the user then had to reach up and tap. Focusing it also means the
   * space below is covered by the keyboard rather than sitting empty — which
   * is what the screen with no search history is, and what an empty state
   * would otherwise have had to fill.
   *
   * Gated on an empty query so this is the *idle* screen's behaviour, not the
   * tab's: coming back from an album opened out of the results should return
   * to those results, not throw a keyboard over them. Deferred a frame because
   * focusing mid-transition drops the keyboard on both platforms.
   */
  useFocusEffect(
    useCallback(() => {
      // Read through a ref: this callback is deliberately not re-created as the
      // query changes (see below), so reading `query` directly would always see
      // the empty string it was created with and autofocus even when results
      // are on screen — exactly what the gate is meant to prevent.
      if (queryRef.current.trim() !== '') return;
      const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(frame);
      // Intentionally not reacting to `query`: this fires on focus, and
      // re-running it as the user types would fight the keyboard.
    }, [])
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
  // doesn't have that choice silently widened out from under them.
  useEffect(() => {
    setSelectedSourceIds(prev => {
      const next = prev.filter(id => enabledSearchSourceIds.includes(id as never));
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledSearchSourceIds.join(',')]);

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

  // Only called from deliberate actions (submitting, tapping a result, replaying a
  // recent search) — never from the as-you-type debounce, or every paused keystroke
  // would get saved as its own history entry.
  const recordSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !activeServerId) return;
    dispatch(addSearchQuery({ serverId: activeServerId, query: trimmed }));
  };

  // Opening a result is the more useful signal than the text that led to it, so
  // the item itself is stored alongside the query and can be reopened directly.
  const recordEntity = (entity: Omit<SearchEntityEntry, 'kind'>) => {
    if (!activeServerId) return;
    dispatch(addSearchEntity({ serverId: activeServerId, entity }));
  };

  const recordResult = (result: SearchResult) => {
    recordSearch(query);
    recordEntity({
      type: result.type,
      id: result.id,
      title: result.title,
      subtitle: result.subtext,
      cover: result.cover,
      source: result.source,
      externalSource: result.externalSource,
      externalIds: result.externalIds,
    });
  };

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

  const onSearchSubmit = () => {
    Keyboard.dismiss();
    recordSearch(query);
  };

  const handleRecentPress = (value: string) => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    Keyboard.dismiss();
    setQuery(value);
    runSearch(value);
    recordSearch(value);
  };

  const handleRemoveRecent = (key: string) => {
    if (activeServerId) dispatch(removeSearchEntry({ serverId: activeServerId, key }));
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
    recordEntity(entity);
    prefetchCovers([entity.cover], 'detail');

    if (entity.type === 'song') {
      void handleRecentSongPress(entity);
      return;
    }
    if (entity.type === 'album') {
      if (entity.source === 'external') {
        navigateToAlbum(externalAlbumFrom({
          id: entity.id,
          title: entity.title,
          artistName: entity.subtitle,
          cover: entity.cover,
          externalSource: entity.externalSource,
          externalIds: entity.externalIds,
        }));
      } else {
        navigation.navigate('albumView', { id: entity.id });
      }
      return;
    }
    if (entity.type === 'artist') {
      if (entity.source === 'external') {
        navigateToArtist(externalArtistFrom({
          id: entity.id,
          name: entity.title,
          cover: entity.cover,
          externalSource: entity.externalSource,
          externalIds: entity.externalIds,
        }));
      } else {
        navigation.navigate('artistView', { id: entity.id });
      }
      return;
    }
    navigation.navigate('playlistView', { id: entity.id });
  };

  const handleClearRecent = () => {
    if (activeServerId) dispatch(clearSearchHistory({ serverId: activeServerId }));
  };

  const handleSongPress = async (result: SearchResult) => {
    recordResult(result);
    try {
      // `SearchResult.song` (src/contexts/searchRanking.ts) is never
      // populated for a library match any more — it would need a
      // credentialled stream URL nobody has asked for yet — so this always
      // resolves by id, same as any result that arrives without one.
      const resolved = await resolvePlayableSong(result.id);
      if (resolved) await playSong(resolved.song);
      else notify.error(t('common.playbackError'));
    } catch {
      notify.error(t('common.playbackError'));
    }
  };

  const handleSongOptions = async (result: SearchResult) => {
    try {
      const resolved = await resolvePlayableSong(result.id);
      if (resolved) {
        openSongOptions(resolved.song);
      } else {
        notify.error(t('common.songDetailsError'));
      }
    } catch {
      notify.error(t('common.songDetailsError'));
    }
  };

  // The library scope only ever contains local results, and "Other sources"
  // only ever contains external ones — `resultScope` already kept the fetch
  // itself from mixing the two (see `planSearchLegs`), and this keeps the
  // render from doing it either, belt and suspenders against a stray result
  // slipping in from a stale request.
  const libraryResults = useMemo(
    () => (resultScope === 'library' ? searchResults.filter(r => r.source === 'local') : []),
    [searchResults, resultScope]
  );

  // Group external results by their source so each gets its own labelled,
  // provenance-tagged section — never merged into one undifferentiated list,
  // and never merged with the library results above.
  const externalResultsBySource = useMemo(() => {
    const groups = new Map<string, typeof searchResults>();
    if (resultScope !== 'other') return groups;
    for (const r of searchResults) {
      if (r.source !== 'external' || !r.externalSource) continue;
      const existing = groups.get(r.externalSource);
      if (existing) existing.push(r);
      else groups.set(r.externalSource, [r]);
    }
    return groups;
  }, [searchResults, resultScope]);

  const coversToPrefetch = useMemo(
    () => searchResults.slice(0, 18).map(r => r.cover),
    [searchResults]
  );
  usePrefetchCovers(coversToPrefetch, 'thumb');

  const toggleFilterSource = useCallback((sourceId: string) => {
    setSelectedSourceIds(prev =>
      prev.includes(sourceId) ? prev.filter(id => id !== sourceId) : [...prev, sourceId]
    );
  }, []);

  const toggleFilterEntityType = useCallback((entityType: SearchEntityType) => {
    setSelectedEntityTypes(prev =>
      prev.includes(entityType) ? prev.filter(type => type !== entityType) : [...prev, entityType]
    );
  }, []);

  const renderResult = (result: SearchResult) => {
    if (result.type === 'song') {
      return (
        <MediaListRow
          title={result.title}
          testID="search-result-song"
          subtitle={result.subtext}
          cover={result.cover}
          onPress={() => { void handleSongPress(result); }}
          trailing={
            <IconActionButton
              icon={<Ellipsis size={iconSize.header} color={colors.secondary} />}
              onPress={() => { void handleSongOptions(result); }}
              accessibilityLabel={t('a11y.rows.options', { title: result.title })}
              size="compact"
            />
          }
        />
      );
    }

    if (result.type === 'album') {
      return result.source === 'external' ? (
        <AlbumRow
          album={externalAlbumFrom({
            id: result.id,
            title: result.title,
            artistName: result.subtext,
            cover: result.cover,
            externalSource: result.externalSource,
            externalIds: result.externalIds,
          })}
          onPress={album => {
            recordResult(result);
            prefetchCovers([album.cover], 'detail');
            navigateToAlbum(album);
          }}
        />
      ) : (
        <AlbumRow
          album={searchResultToLocalAlbum(result, activeServerId ?? undefined)}
          onPress={album => {
            recordResult(result);
            prefetchCovers([album.cover], 'detail');
            if (isExternalAlbum(album)) return;
            // Server adapter identity — becomes `useAlbum(id)` -> `api.albums.get(id)`.
            navigation.navigate('albumView', { id: album.nativeId });
          }}
        />
      );
    }

    if (result.type === 'artist') {
      return (
        <ArtistRow
          artist={searchResultToArtist(result, activeServerId ?? undefined)}
          rounded
          onPress={() => {
            recordResult(result);
            prefetchCovers([result.cover], 'detail');
            if (result.source === 'external') {
              navigateToArtist(externalArtistFrom({
                id: result.id,
                name: result.title,
                cover: result.cover,
                externalSource: result.externalSource,
                externalIds: result.externalIds,
              }));
            } else {
              navigation.navigate('artistView', { id: result.id });
            }
          }}
        />
      );
    }

    if (result.type === 'playlist') {
      return (
        <PlaylistRow
          playlist={searchResultToPlaylist(result, activeServerId ?? undefined)}
          onPress={() => {
            recordResult(result);
            prefetchCovers([result.cover], 'detail');
            navigation.navigate('playlistView', { id: result.id });
          }}
        />
      );
    }

    return null;
  };

  const isOtherScope = resultScope === 'other';
  const noResultsForScope = query.trim() !== '' && hasSearched && !isLoading
    && (isOtherScope ? externalResultsBySource.size === 0 : libraryResults.length === 0);

  return (
    <SafeAreaView testID="search-screen" edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <TabHeader
        title={t('search.title')}
        username={username}
        onAccountPress={openAccountSheet}
      />
      <View style={styles.headerRow}>
        <View style={[styles.searchContainer, { backgroundColor: colors.muted, borderRadius: rad.md }]}>
          <SearchIcon size={iconSize.row} color={colors.placeholder} style={styles.searchIcon} />
          <TextInput
            accessibilityLabel={t('a11y.searchInput')}
            testID="search-input"
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.secondary }]}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={onSearchChange}
            returnKeyType="search"
            onSubmitEditing={onSearchSubmit}
            // A library is full of names iOS has never seen — `pornophonique`,
            // `netBloc`, `Ugress`. Left to its defaults the field capitalises
            // the first letter and autocorrects the rest into English words,
            // so the query that reaches the server is not the one that was
            // typed. None of the three helps when the target is a proper noun.
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            clearButtonMode="never"
          />
          {query !== '' && (
            <Touchable
              accessibilityRole="button"
              accessibilityLabel={t('a11y.search.clear')}
              style={styles.clearButton}
              hitSlop={hitSlopFor(20)}
              onPress={() => { setQuery(''); clearSearch(); setHasSearched(false); }}
            >
              <X size={iconSize.control} color={colors.secondary} />
            </Touchable>
          )}
        </View>
        <Touchable
          testID="search-filters-button"
          accessibilityRole="button"
          accessibilityLabel={t('search.filters.title')}
          accessibilityState={{ selected: isOtherScope }}
          style={[
            styles.filtersButton,
            {
              backgroundColor: isOtherScope ? colors.themeColor + '26' : colors.muted,
              borderRadius: rad.md,
            },
          ]}
          onPress={() => filtersSheetRef.current?.present()}
        >
          <SlidersHorizontal
            size={iconSize.row}
            color={isOtherScope ? colors.themeColor : colors.secondary}
          />
        </Touchable>
      </View>

      {hasSearched && !isLoading && (hasError || degraded) && (
        <StatusBanner
          icon={<CloudOff size={iconSize.badge} color={colors.subtext} />}
          text={hasError ? t('search.searchError') : t('search.searchLocalOnly')}
          closable
          style={styles.errorBanner}
          testID="search-error-banner"
        />
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollClearance }]}
        keyboardShouldPersistTaps="handled"
        // Scrolling the results puts the keyboard away, the way every other
        // iOS search screen behaves. Without this the keyboard covers the
        // bottom half of the results (and the mini player) for as long as the
        // query is on screen, and there is no gesture that dismisses it:
        // `keyboardShouldPersistTaps="handled"` deliberately swallows taps on
        // empty space, so the field can only be dismissed by submitting.
        keyboardDismissMode="on-drag"
      >
        {query.trim() === ''
          ? (
            <RecentSearches
              queries={recentQueries}
              entities={recentEntities}
              onQueryPress={handleRecentPress}
              onEntityPress={handleRecentEntityPress}
              onRemove={handleRemoveRecent}
              onClear={handleClearRecent}
            />
          )
          : isLoading
            ? [...Array(8)].map((_, i) => <SkeletonListRow key={i} />)
            : (
              <>
                {!isOtherScope && libraryResults.map(result => (
                  <View key={`local:${result.type}:${result.id}`} style={styles.resultBlock}>
                    {renderResult(result)}
                  </View>
                ))}

                {isOtherScope && Array.from(externalResultsBySource.entries()).map(([sourceId, results]) => {
                  const meta = getSourceMeta(sourceId);
                  const label = meta?.label ?? sourceId;
                  const color = meta?.color ?? colors.subtext;
                  const letter = label.charAt(0).toUpperCase();
                  return (
                    <React.Fragment key={sourceId}>
                      <View style={styles.sourceHeader}>
                        {showSourceHeaders && (
                          <View style={[styles.sourceBadge, { backgroundColor: color, borderRadius: rad.pill }]}>
                            <Text style={styles.sourceBadgeLetter}>{letter}</Text>
                          </View>
                        )}
                        <Text style={[styles.sourceHeaderText, { color: colors.subtext }]}>{label}</Text>
                      </View>
                      {results.map((result, i) => (
                        <View key={`external:${result.type}:${result.id}`} style={[styles.resultBlock, i === 0 && styles.resultBlockFirst]}>
                          {renderResult(result)}
                        </View>
                      ))}
                    </React.Fragment>
                  );
                })}
              </>
            )
        }

        {noResultsForScope && (
          <Text testID="search-no-results" style={[styles.noResults, { color: colors.subtext }]}>
            {t('search.noResults')}
          </Text>
        )}
      </ScrollView>

      <SearchFiltersSheet
        ref={filtersSheetRef}
        resultScope={resultScope}
        onChangeScope={setResultScope}
        availableSourceIds={enabledSearchSourceIds}
        selectedSourceIds={selectedSourceIds}
        onToggleSource={toggleFilterSource}
        selectedEntityTypes={selectedEntityTypes}
        onToggleEntityType={toggleFilterEntityType}
      />
    </SafeAreaView>
  );
};

export default Search;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filtersButton: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  resultBlock: {},
  resultBlockFirst: {
    paddingTop: spacing.sm,
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.roomy,
    paddingBottom: spacing.xs,
  },
  sourceBadge: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceBadgeLetter: {
    ...typography.micro,
    fontWeight: '500',
    color: onDark.text,
  },
  sourceHeaderText: {
    ...typography.rowSubtitle,
    fontWeight: '500',
  },
  noResults: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
