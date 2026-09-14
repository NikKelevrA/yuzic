import React, { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { useEnabledSearchSourceIds, useSearchSourceEnabled } from './useSearchSourcesEnabled';
import settingsSourcesReducer, { setSourceUse, setSourceUses } from '@/features/settings/sources/state';
import { DISCOVERY_USES } from '@/providers/registry/sources';

jest.mock('@/features/connectivity/useIsOffline', () => ({
  useIsOffline: () => mockIsOffline,
}));

// eslint-disable-next-line no-var -- hoisted for the jest.mock factory above
var mockIsOffline = false;

function makeStore() {
  return configureStore({ reducer: { settingsSources: settingsSourcesReducer } });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  return Wrapper;
}

describe('useEnabledSearchSourceIds', () => {
  beforeEach(() => {
    mockIsOffline = false;
  });

  it('is empty by default — every other use of a source says nothing about search', async () => {
    const store = makeStore();
    // Everything onboarding's discovery turns on must not leak into search.
    store.dispatch(setSourceUses({ uses: DISCOVERY_USES, enabled: true }));
    const { result } = await renderHook(() => useEnabledSearchSourceIds(), { wrapper: wrapper(store) });
    expect(result.current).toEqual([]);
  });

  it('includes a source once its search use is on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'deezer.search', enabled: true }));
    const { result } = await renderHook(() => useEnabledSearchSourceIds(), { wrapper: wrapper(store) });
    expect(result.current).toEqual(['deezer']);
  });

  it('drops every source while the device is offline', async () => {
    const store = makeStore();
    store.dispatch(setSourceUses({ uses: ['deezer.search', 'musicbrainz.search'], enabled: true }));
    mockIsOffline = true;
    const { result } = await renderHook(() => useEnabledSearchSourceIds(), { wrapper: wrapper(store) });
    expect(result.current).toEqual([]);
  });
});

describe('useSearchSourceEnabled', () => {
  beforeEach(() => {
    mockIsOffline = false;
  });

  it('reads one source in isolation', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'musicbrainz.search', enabled: true }));
    const { result } = await renderHook(() => useSearchSourceEnabled('musicbrainz'), { wrapper: wrapper(store) });
    expect(result.current).toBe(true);
  });
});
