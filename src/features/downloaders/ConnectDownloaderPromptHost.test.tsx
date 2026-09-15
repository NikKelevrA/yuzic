import React, { type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import ConnectDownloaderPromptHost from './ConnectDownloaderPromptHost';
import { dismissConnectDownloaderPrompt, promptConnectDownloader } from './connectDownloaderPrompt';
import settingsAppearanceReducer from '@/features/settings/appearance/state';

jest.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: () => {} },
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}:${Object.values(options).join('|')}` : key,
  }),
}));
jest.mock('@gorhom/bottom-sheet', () => require('@gorhom/bottom-sheet/mock'));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// The registry's real definitions pull in every downloader's client; the host
// only reads what each one is and what it takes.
jest.mock('./registry', () => ({
  ALL_DOWNLOADERS: [
    { id: 'albums-only', label: 'Albums Only', descriptionKey: 'desc.albums', settingsRoute: '/settings/albumsOnly', downloadAlbum: jest.fn() },
    { id: 'both', label: 'Both', descriptionKey: 'desc.both', settingsRoute: '/settings/both', downloadAlbum: jest.fn(), downloadTrack: jest.fn() },
    { id: 'tracks-only', label: 'Tracks Only', descriptionKey: 'desc.tracks', settingsRoute: '/settings/tracksOnly', downloadTrack: jest.fn() },
  ],
}));

async function renderHost() {
  const store = configureStore({ reducer: { settingsAppearance: settingsAppearanceReducer } });
  const Wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  Wrapper.displayName = 'TestStoreWrapper';
  return render(<ConnectDownloaderPromptHost />, { wrapper: Wrapper });
}

describe('ConnectDownloaderPromptHost', () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  // Awaited: an act left open here overlaps the next test's render.
  afterEach(async () => {
    await act(async () => dismissConnectDownloaderPrompt());
  });

  it('shows nothing until a Get needs a downloader', async () => {
    const view = await renderHost();

    expect(view.queryByTestId('connect-downloader-not-now')).toBeNull();
  });

  it('says why, and offers every downloader for an album — a track-only one takes it as its tracks', async () => {
    const view = await renderHost();

    await act(async () => promptConnectDownloader('album'));

    expect(view.getByText('externalAlbum.connectDownloader.title')).toBeTruthy();
    expect(view.getByText('externalAlbum.connectDownloader.body')).toBeTruthy();
    expect(view.getByText('externalAlbum.connectDownloader.setUp:Albums Only')).toBeTruthy();
    expect(view.getByText('externalAlbum.connectDownloader.setUp:Both')).toBeTruthy();
    expect(view.getByText('externalAlbum.connectDownloader.setUp:Tracks Only')).toBeTruthy();
  });

  it('offers only downloaders that take a track when a track was asked for', async () => {
    const view = await renderHost();

    await act(async () => promptConnectDownloader('track'));

    expect(view.queryByTestId('connect-downloader-albums-only')).toBeNull();
    expect(view.getByTestId('connect-downloader-both')).toBeTruthy();
    expect(view.getByTestId('connect-downloader-tracks-only')).toBeTruthy();
  });

  it("opens the chosen downloader's settings and closes", async () => {
    const view = await renderHost();

    await act(async () => promptConnectDownloader('album'));
    await fireEvent.press(view.getByTestId('connect-downloader-both'));

    expect(mockPush).toHaveBeenCalledWith('/settings/both');
    expect(view.queryByTestId('connect-downloader-not-now')).toBeNull();
  });

  it('goes nowhere when the answer is not now', async () => {
    const view = await renderHost();

    await act(async () => promptConnectDownloader('album'));
    await fireEvent.press(view.getByTestId('connect-downloader-not-now'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(view.queryByTestId('connect-downloader-not-now')).toBeNull();
  });
});
