import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import settingsReducer, {
  setLastfmEnabled,
  setMetadataArtworkSourceEnabled,
} from '@/features/settings/metadata/state';
import { useMetadataEnrichmentBroker } from './enrichmentBroker';
import { lastfmProvider } from './lastfm';
import { deezerProvider } from './deezer';
import { musicbrainzProvider } from './musicbrainz';

function makeStore() {
  return configureStore({
    reducer: combineReducers({ settingsMetadata: settingsReducer }),
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

  it('allows Last.fm for artist bio only once Last.fm is on', async () => {
    const store = makeStore();
    store.dispatch(setLastfmEnabled(true));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(lastfmProvider.id, 'artist.enrich')).toBe(true);
    // Last.fm was never a source in the old artwork chain — turning on bio
    // must not also enable it for album covers.
    expect(result.current.isAllowed(lastfmProvider.id, 'album.enrich')).toBe(false);
  });

  it('allows Deezer for album covers once the artwork toggle is on', async () => {
    const store = makeStore();
    store.dispatch(setMetadataArtworkSourceEnabled({ sourceId: deezerProvider.id, enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(deezerProvider.id, 'album.enrich')).toBe(true);
    expect(result.current.isAllowed(deezerProvider.id, 'artist.enrich')).toBe(true);
  });

  it('routes the old "coverartarchive" artwork toggle to the MusicBrainz provider for album covers', async () => {
    const store = makeStore();
    store.dispatch(setMetadataArtworkSourceEnabled({ sourceId: 'coverartarchive', enabled: true }));
    const { result } = await renderBroker(store);

    expect(result.current.isAllowed(musicbrainzProvider.id, 'album.enrich')).toBe(true);
    // MusicBrainz never served artist bio in the old artist-info chain.
    expect(result.current.isAllowed(musicbrainzProvider.id, 'artist.enrich')).toBe(false);
  });

  it('carries the stored artwork order through to the broker order (ordered first-hit fallback)', async () => {
    const store = makeStore();
    // Order is kept in the order sources were turned on.
    store.dispatch(setMetadataArtworkSourceEnabled({ sourceId: 'coverartarchive', enabled: true }));
    store.dispatch(setMetadataArtworkSourceEnabled({ sourceId: 'deezer', enabled: true }));
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
