import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ConnectionsView from './';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-redux', () => ({
  shallowEqual: () => true,
  // The screen asks for every declared integration's connected state at once;
  // the shared settings chrome asks for things this test does not set up.
  useSelector: (selector: (state: unknown) => unknown) => {
    try { return selector({}); } catch { return undefined; }
  },
}));

jest.mock('@/state/redux/selectors/listenbrainzSelectors', () => ({
  selectListenBrainzAuthenticated: () => false,
}));

jest.mock('@/state/redux/selectors/audiomuseSelectors', () => ({
  selectAudiomuseEnabled: () => true,
  selectAudiomuseAuthenticated: () => true,
}));

jest.mock('@/state/redux/selectors/playlistImportSelectors', () => ({
  selectPlaylistImportEnabled: () => false,
  selectPlaylistImportAuthenticated: () => false,
}));

jest.mock('@/features/downloaders/registry', () => ({
  useDownloaderStates: () => [
    { def: { id: 'lidarr', settingsRoute: '/settings/lidarrView' }, isConnected: true },
    { def: { id: 'ytfallback', settingsRoute: '/settings/ytfallbackView' }, isConnected: false },
  ],
}));

describe('ConnectionsView', () => {
  it('lists only managed integrations and downloaders, not feature-source toggles', async () => {
    const view = await render(<ConnectionsView />);

    expect(view.queryByText('Deezer')).toBeNull();
    expect(view.queryByText('MusicBrainz')).toBeNull();
    expect(view.queryByText('Last.fm')).toBeNull();

    expect(view.getByText('ListenBrainz')).toBeTruthy();
    expect(view.getByText('AudioMuse-AI')).toBeTruthy();
    expect(view.getByText('Playlist Imports')).toBeTruthy();

    // Downloaders (formerly the Downloaders hub) — labelled via i18n keys,
    // which the mocked i18n instance echoes back as the key itself.
    expect(view.getByText('settings.downloaders.lidarr.title')).toBeTruthy();
    expect(view.getByText('settings.downloaders.ytfallback.title')).toBeTruthy();
    // Ready: AudioMuse + Lidarr. Not set up: Playlist Imports + YT Fallback.
    // ListenBrainz uses its own connected/notConnected wording, not these.
    expect(view.getAllByText('settings.connections.status.ready')).toHaveLength(2);
    expect(view.getAllByText('settings.connections.status.notSetUp')).toHaveLength(2);

    fireEvent.press(view.getByText('AudioMuse-AI'));
    expect(mockPush).toHaveBeenCalledWith('/settings/audiomuseView');

    fireEvent.press(view.getByText('settings.downloaders.lidarr.title'));
    expect(mockPush).toHaveBeenCalledWith('/settings/lidarrView');
  });
});
