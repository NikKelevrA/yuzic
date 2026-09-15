import React, { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { useSearchHistory } from './searchHistory';
import searchHistoryReducer from '@/state/redux/slices/searchHistorySlice';
import serversReducer, { setActiveServer } from '@/state/redux/slices/serversSlice';
import type { SearchResult } from '@/features/search/searchRanking';

function makeStore(activeServerId = 'srv-1') {
  const store = configureStore({ reducer: { searchHistory: searchHistoryReducer, servers: serversReducer } });
  store.dispatch(setActiveServer(activeServerId));
  return store;
}

function wrapper(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  return Wrapper;
}

const songResult: SearchResult = {
  id: 's-1',
  title: 'The Chain',
  subtext: 'Fleetwood Mac',
  cover: { kind: 'none' },
  type: 'song',
  source: 'local',
  isDownloaded: true,
};

describe('useSearchHistory', () => {
  it('records a query, then a result opened from it, for the active server', async () => {
    const store = makeStore();
    const { result } = await renderHook(() => useSearchHistory('srv-1'), { wrapper: wrapper(store) });

    await act(async () => result.current.recordResult('the chain', songResult));

    const state = store.getState().searchHistory.byServer['srv-1'];
    expect(state).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'query', text: 'the chain' }),
      expect.objectContaining({ kind: 'entity', type: 'song', id: 's-1', title: 'The Chain' }),
    ]));
  });

  it('does nothing when there is no active server', async () => {
    const store = makeStore();
    const { result } = await renderHook(() => useSearchHistory(undefined), { wrapper: wrapper(store) });

    await act(async () => {
      result.current.recordSearch('the chain');
      result.current.recordEntity({ type: 'song', id: 's-1', title: 'The Chain', subtitle: '', cover: { kind: 'none' }, source: 'local' });
    });

    expect(store.getState().searchHistory.byServer).toEqual({});
  });

  it('removes and clears entries for the active server', async () => {
    const store = makeStore();
    const { result } = await renderHook(() => useSearchHistory('srv-1'), { wrapper: wrapper(store) });

    await act(async () => result.current.recordSearch('rumours'));
    expect(store.getState().searchHistory.byServer['srv-1']).toHaveLength(1);

    await act(async () => result.current.clear());
    expect(store.getState().searchHistory.byServer['srv-1']).toEqual([]);
  });
});
