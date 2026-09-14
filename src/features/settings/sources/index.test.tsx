import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';

import settingsHomeReducer from '@/features/settings/home/state';
import settingsMetadataReducer from '@/features/settings/metadata/state';
import settingsSearchReducer from '@/features/settings/search/state';
import OnlineSourcesSettings from './';

let mockOffline = false;
let mockParams: { source?: string } = {};

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockParams }));
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: { subtext: '#aaa', secondary: '#fff', themeColor: '#f00' } }) }));
jest.mock('../components/SettingsScreen', () => {
  const { View } = require('react-native');
  return function MockSettingsScreen({ children }: any) { return <View>{children}</View>; };
});
jest.mock('../components/SettingsCard', () => {
  const { View } = require('react-native');
  return function MockSettingsCard({ children }: any) { return <View>{children}</View>; };
});
jest.mock('../components/SettingsCardHeader', () => {
  const { Text } = require('react-native');
  return function MockSettingsCardHeader({ title }: any) { return <Text>{title}</Text>; };
});

function makeStore() {
  return configureStore({
    reducer: combineReducers({
      settingsHome: settingsHomeReducer,
      settingsMetadata: settingsMetadataReducer,
      settingsSearch: settingsSearchReducer,
    }),
  });
}

async function renderScreen(store = makeStore()) {
  const view = await render(<Provider store={store}><OnlineSourcesSettings /></Provider>);
  return { view, store };
}

/** Switches, in screen order, keyed by the label beside each. */
function switchFor(view: Awaited<ReturnType<typeof renderScreen>>['view'], label: string) {
  const labels = view.getAllByText(/^settings\.sources\.[a-z]+\.[a-zA-Z]+$/)
    .map(node => node.props.children as string)
    .filter(text => !/\.(name|sends|[a-zA-Z]+Subtext)$/.test(text));
  return view.getAllByRole('switch')[labels.indexOf(label)];
}

describe('Online sources', () => {
  beforeEach(() => { mockOffline = false; mockParams = {}; });

  it('lists every outside service, each with what it is sent, all off', async () => {
    const { view } = await renderScreen();

    for (const id of ['deezer', 'listenbrainz', 'lastfm', 'musicbrainz', 'coverartarchive']) {
      expect(view.getByTestId(`online-source-${id}`)).toBeTruthy();
      expect(view.getByText(`settings.sources.${id}.name`)).toBeTruthy();
      expect(view.getByText(`settings.sources.${id}.sends`)).toBeTruthy();
    }
    const switches = view.getAllByRole('switch');
    expect(switches).toHaveLength(7);
    expect(switches.every(s => s.props.value === false)).toBe(true);
    expect(view.queryByTestId('online-sources-offline')).toBeNull();
  });

  it('writes each switch to the one setting its features read', async () => {
    const { view, store } = await renderScreen();

    for (const label of [
      'settings.sources.deezer.pages',
      'settings.sources.deezer.search',
      'settings.sources.deezer.artwork',
      'settings.sources.listenbrainz.discovery',
      'settings.sources.lastfm.artistInfo',
      'settings.sources.musicbrainz.search',
      'settings.sources.coverartarchive.covers',
    ]) {
      await fireEvent(switchFor(view, label), 'valueChange', true);
    }

    const state = store.getState();
    expect(state.settingsHome.deezerDiscoveryEnabled).toBe(true);
    expect(state.settingsHome.listenbrainzDiscoveryEnabled).toBe(true);
    expect(state.settingsSearch.searchSourcesEnabled).toEqual({ deezer: true, musicbrainz: true });
    expect(state.settingsMetadata.metadataArtworkEnabled).toEqual({ deezer: true, coverartarchive: true });
    expect(state.settingsMetadata.lastfmEnabled).toBe(true);
  });

  it('says the sources are paused while offline', async () => {
    mockOffline = true;
    const { view } = await renderScreen();
    expect(view.getByTestId('online-sources-offline')).toBeTruthy();
  });
});
