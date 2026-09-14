import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import settingsSourcesReducer, { setSourceUse } from '@/features/settings/sources/state';
import { useMetadataEnrichmentBroker } from './enrichmentBroker';
import { lastfmProvider } from './lastfm';
import { deezerProvider } from './deezer';
import { musicbrainzProvider } from './musicbrainz';

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
  it('disallows every provider when every source is off (a disabled source contributes nothing)', async () => {
    const store = makeStore();
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(false);
    expect(result.current.isAllowed(deezerProvider.id, 'artist.enrich')).toBe(false);
    expect(result.current.isAllowed(deezerProvider.id, 'album.enrich')).toBe(false);
    expect(result.current.isAllowed(musicbrainzProvider.id, 'album.enrich')).toBe(false);
  });

  it('allows Last.fm for artist info only once its artist-info use is on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'lastfm.artistInfo', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(true);
    // Last.fm provides no artwork — turning on bios must not also enable it for covers.
    expect(result.current.isAllowed(lastfmProvider.id, 'album.enrich')).toBe(false);
  });

  it('does not use Last.fm for artist info just because its similar artists are on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'lastfm.similarArtists', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(false);
  });

  it('allows Deezer for artist photos and album covers once its artwork use is on', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'deezer.artwork', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(deezerProvider.id, 'album.enrich')).toBe(true);
    expect(result.current.isAllowed(deezerProvider.id, 'artist.enrich')).toBe(true);
  });

  it('routes Cover Art Archive artwork to the MusicBrainz provider for album covers', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'coverartarchive.artwork', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(musicbrainzProvider.id, 'album.enrich')).toBe(true);
    expect(result.current.isAllowed(musicbrainzProvider.id, 'artist.enrich')).toBe(false);
  });

  it('tries Cover Art Archive before Deezer for covers, whatever order they were turned on in', async () => {
    const store = makeStore();
    store.dispatch(setSourceUse({ use: 'deezer.artwork', enabled: true }));
    store.dispatch(setSourceUse({ use: 'coverartarchive.artwork', enabled: true }));
    const { result } = await renderBroker(store);

    const order = result.current.order ?? [];
    expect(order.indexOf(musicbrainzProvider.id)).toBeLessThan(order.indexOf(deezerProvider.id));
  });

  it('every provider is treated as reachable — invocation failures are each capability\'s own concern', async () => {
    const store = makeStore();
    const { result } = await renderBroker(store);

    expect(result.current.isConnected(lastfmProvider.id)).toBe(true);
    expect(result.current.isConnected(deezerProvider.id)).toBe(true);
    expect(result.current.isConnected(musicbrainzProvider.id)).toBe(true);
  });

  it('includes every metadata.enrich provider so resolveArtistDetails/resolveAlbumDetails can consult them', async () => {
    const store = makeStore();
    const { result } = await renderBroker(store);

    const ids = result.current.providers.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining([lastfmProvider.id, deezerProvider.id, musicbrainzProvider.id]));
  });
});
