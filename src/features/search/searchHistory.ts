/**
 * Recent-query and recent-entity handling for the Search screen.
 *
 * Recording is deliberately narrow: only a deliberate action (submitting,
 * tapping a result, replaying a recent search) records anything — never the
 * as-you-type debounce, or every paused keystroke would get saved as its own
 * history entry. Opening a result is the more useful signal than the text
 * that led to it, so the item itself is stored alongside the query and can be
 * reopened directly without searching again.
 */
import { useDispatch, useSelector } from 'react-redux';
import type { SearchResult } from '@/features/search/searchRanking';
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

export function useSearchHistory(activeServerId: string | undefined) {
  const dispatch = useDispatch();
  const recentQueries = useSelector(selectRecentSearchQueries);
  const recentEntities = useSelector(selectRecentSearchEntities);

  const recordSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !activeServerId) return;
    dispatch(addSearchQuery({ serverId: activeServerId, query: trimmed }));
  };

  const recordEntity = (entity: Omit<SearchEntityEntry, 'kind'>) => {
    if (!activeServerId) return;
    dispatch(addSearchEntity({ serverId: activeServerId, entity }));
  };

  /** Records both the query that found it and the result itself. */
  const recordResult = (query: string, result: SearchResult) => {
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

  const removeEntry = (key: string) => {
    if (activeServerId) dispatch(removeSearchEntry({ serverId: activeServerId, key }));
  };

  const clear = () => {
    if (activeServerId) dispatch(clearSearchHistory({ serverId: activeServerId }));
  };

  return { recentQueries, recentEntities, recordSearch, recordEntity, recordResult, removeEntry, clear };
}
