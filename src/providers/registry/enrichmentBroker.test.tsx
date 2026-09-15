import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import settingsSourcesReducer, { setSourceUse } from '@/features/settings/sources/state';
import { metadataSourceNameKey, useMetadataEnrichmentBroker } from './enrichmentBroker';
import { lastfmProvider } from './lastfm';
import { deezerProvider } from './deezer';

function makeStore() {
  return configureStore({
    reducer: combineReducers({ settingsSources: settingsSourcesReducer }),
    middleware: getDefault => getDefault({ serializableCheck: false }),
  });
}

async function renderBroker(store: ReturnType<typeof makeStore>) {
  return renderHook(() => useMetadataEnrichmentBroker(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>,
  });
}

describe('useMetadataEnrichmentBroker', () => {
  it('allows nothing while artist info is off', async () => {
    const { result } = await renderBroker(makeStore());

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(false);
  });

  it('allows Last.fm for artist info once its artist-info use is on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'lastfm.artistInfo', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(true);
  });

  it('does not use Last.fm for artist info just because its similar artists are on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'lastfm.similarArtists', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(false);
  });

  it('never serves pictures — artwork backups turn nothing on here', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'deezer.artwork', enabled: true }));
    store.dispatch(setSourceUse({ use: 'coverartarchive.artwork', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.providers.map(p => p.id)).toEqual([lastfmProvider.id]);
    expect(result.current.isAllowed(deezerProvider.id, 'artist.enrich')).toBe(false);
  });

  it('names the provider that filled a field, and nothing it does not serve', () => {
    expect(metadataSourceNameKey(lastfmProvider.id)).toBe(lastfmProvider.presentation.nameKey);
    expect(metadataSourceNameKey('srv-1')).toBeNull();
  });
});
