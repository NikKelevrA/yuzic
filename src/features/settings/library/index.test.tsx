import React, { type ReactNode } from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import LibrarySettings from './';
import settingsDownloadsReducer from '@/features/settings/downloads/state';
import settingsPlaybackReducer from '@/features/settings/playback/state';
import settingsSyncReducer from '@/features/settings/sync/state';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import serversReducer, { addServer, setActiveServer } from '@/state/redux/slices/serversSlice';
import offlineMutationsReducer, { enqueueOfflineMutationAction } from '@/state/redux/slices/offlineMutationsSlice';
import type { Server } from '@/providers/contracts/Server';
import { makeLocalId } from '@/domain/identity/LocalId';
import { serverProvenance } from '@/domain/identity/Provenance';

// Boundaries only: the sync run, the server's library list and the file
// picker. The sections, the settings components and the real slices render
// for real, so these fail when a control stops writing what it claims to.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/components/toast', () => ({
  notify: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/features/library/useSync', () => ({
  useSync: () => ({ sync: mockSync, syncPlaylists: jest.fn(), isSyncing: false, lastSyncedAt: null }),
}));
// Which libraries a server has is an HTTP call; where the choice is stored is
// the provider's key. Both stand in here with the simplest faithful shape.
jest.mock('@/providers/registry/serverConnections', () => ({
  listServerLibraries: () => mockListLibraries(),
  selectedLibraryIds: (server: { auth?: { libraryIds?: string[] } }) => server.auth?.libraryIds ?? [],
  libraryScopePatch: (_server: unknown, ids: string[]) => ({ libraryIds: ids }),
}));
jest.mock('@/providers/server/local/pickAndImport', () => ({
  pickAndImportLocalFiles: () => mockPick(),
}));

/* eslint-disable no-var -- hoisted for the jest.mock factories above */
var mockSync = jest.fn(async () => {});
var mockListLibraries = jest.fn(async () => [
  { id: 'lib-music', name: 'Music' },
  { id: 'lib-books', name: 'Audiobooks' },
]);
var mockPick = jest.fn();
/* eslint-enable no-var */

import { notify } from '@/components/toast';

const navidrome: Server = {
  id: 'srv-1',
  type: 'navidrome',
  serverUrl: 'https://music.example',
  username: 'ari',
  auth: {},
  isAuthenticated: true,
};
const local: Server = { ...navidrome, id: 'local-1', type: 'local', serverUrl: '' };

function makeStore(server: Server = navidrome) {
  const store = configureStore({
    reducer: {
      settingsDownloads: settingsDownloadsReducer,
      settingsPlayback: settingsPlaybackReducer,
      settingsSync: settingsSyncReducer,
      settingsAppearance: settingsAppearanceReducer,
      servers: serversReducer,
      offlineMutations: offlineMutationsReducer,
    },
  });
  store.dispatch(addServer(server));
  store.dispatch(setActiveServer(server.id));
  return store;
}

async function renderScreen(store: ReturnType<typeof makeStore>) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  Wrapper.displayName = 'TestStoreWrapper';
  const view = await render(<LibrarySettings />, { wrapper: Wrapper });
  // The library list loads on mount; let it land before anything is pressed.
  await waitFor(() => expect(mockListLibraries).toHaveBeenCalled());
  return view;
}

describe('LibrarySettings', () => {
  beforeEach(() => {
    mockSync.mockClear();
    mockListLibraries.mockClear();
    mockPick.mockReset();
    (notify.success as jest.Mock).mockClear();
    (notify.error as jest.Mock).mockClear();
    jest.restoreAllMocks();
  });

  it('writes sync-on-start and both download switches to the store', async () => {
    const store = makeStore();
    const before = store.getState();
    const view = await renderScreen(store);

    // In screen order: Stats' sync-on-start, then Downloads' two switches.
    const [syncOnStart, autoDownload, wifiOnly] = view.getAllByRole('switch');
    await fireEvent(syncOnStart, 'valueChange', !before.settingsSync.syncOnAppStart);
    await fireEvent(autoDownload, 'valueChange', !before.settingsDownloads.autoDownloadNewSongs);
    await fireEvent(wifiOnly, 'valueChange', !before.settingsDownloads.downloadOnWifiOnly);

    const after = store.getState();
    expect(after.settingsSync.syncOnAppStart).toBe(!before.settingsSync.syncOnAppStart);
    expect(after.settingsDownloads.autoDownloadNewSongs).toBe(!before.settingsDownloads.autoDownloadNewSongs);
    expect(after.settingsDownloads.downloadOnWifiOnly).toBe(!before.settingsDownloads.downloadOnWifiOnly);
  });

  it('says it has never synced, and syncs now on request', async () => {
    const view = await renderScreen(makeStore());

    expect(view.getByText('settings.library.stats.neverSynced')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('settings.library.stats.lastSynced'));

    expect(mockSync).toHaveBeenCalledWith(true);
  });

  it('narrows the library to a chosen one and resyncs, and "all" widens it again', async () => {
    const store = makeStore();
    const view = await renderScreen(store);
    const scope = () => store.getState().servers.servers[0].auth?.libraryIds;

    await fireEvent.press(await view.findByText('Audiobooks'));
    expect(scope()).toEqual(['lib-books']);
    await waitFor(() => expect(mockSync).toHaveBeenCalledWith(true));

    await fireEvent.press(view.getByText('settings.library.librarySelect.all'));
    expect(scope()).toEqual([]);
  });

  it('retries failed offline changes, and discards them only once confirmed', async () => {
    const store = makeStore();
    store.dispatch(enqueueOfflineMutationAction({
      id: 'm1',
      serverId: navidrome.id,
      createdAt: 0,
      type: 'unstarSong',
      songId: makeLocalId('song', serverProvenance(navidrome.id), 's1'),
      lastError: 'server said no',
    }));
    const view = await renderScreen(store);

    await fireEvent.press(view.getByText('settings.library.offlineChanges.retry'));
    expect(store.getState().offlineMutations.queue[0].lastError).toBeUndefined();

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await fireEvent.press(view.getByText('settings.library.offlineChanges.discard'));
    expect(store.getState().offlineMutations.queue).toHaveLength(1);

    const buttons = alert.mock.calls[0][2] as { style?: string; onPress?: () => void }[];
    await act(async () => buttons.find(button => button.style === 'destructive')!.onPress!());
    expect(store.getState().offlineMutations.queue).toHaveLength(0);
  });

  it('imports files into the on-device library and syncs them in', async () => {
    mockPick.mockResolvedValue({ imported: 2, unsupported: 1, failed: 0 });
    const view = await renderScreen(makeStore(local));

    // Choosing libraries is a server's setting; files on the device have none.
    expect(view.queryByText('settings.library.librarySelect.all')).toBeNull();
    await fireEvent.press(view.getByText('settings.library.localFiles.import'));

    await waitFor(() => expect(mockSync).toHaveBeenCalledWith(true));
    expect(notify.success).toHaveBeenCalledWith('onboarding.local.imported');
    expect(notify.error).toHaveBeenCalledWith('onboarding.local.unsupported');
  });

  it('offers no file import for a media server', async () => {
    const view = await renderScreen(makeStore());

    expect(view.queryByText('settings.library.localFiles.import')).toBeNull();
  });
});
