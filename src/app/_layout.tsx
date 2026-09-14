import { motion } from '@/constants/design';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';

import { QueryClient, QueryCache, onlineManager } from '@tanstack/react-query';
import { ToastHost, notify } from '@/components/toast';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { enableFreeze } from 'react-native-screens';
import { PlayingProvider } from '@/features/playback/PlayingContext';
import { DlnaProvider } from '@/features/player/DlnaContext';
import { PlaybackSinkProvider } from '@/features/player/PlaybackSinkContext';
import { SongActionSheetProvider } from '@/features/entity-actions/SongActionSheetContext';
import { DownloadProvider } from '@/features/offline/DownloadContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import store, { persistor } from '@/state/redux/store';
import { Alert, AppState } from 'react-native';
import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler';
import RNRestart from 'react-native-restart';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PlayerExpansionProvider } from '@/features/player/PlayerExpansion';
import PlayerHost from '@/features/player/PlayerHost';
import { useTheme } from '@/features/theme/useTheme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { selectLanguage } from '@/features/settings/appearance/state';
import i18n from '@/i18n';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { queryCacheStorage } from '@/utils/mmkvStorage';
import NetInfo from '@react-native-community/netinfo';
import OfflineMutationReplayer from '@/offline/OfflineMutationReplayer';
import { isLikelyNetworkError, setServerUnreachable } from '@/features/connectivity/serverReachability';
import { QueryKeys } from '@/enums/queryKeys';
import { clearImageMemoryCache, runImageCacheMigration } from '@/utils/images/imageCache';
import { useClientCertificate } from '@/features/mtls/useClientCertificate';
import { hydrateAll } from '@/state/credentialCache';
import type { CredentialScope } from '@/state/credentials';
import { setCredentialsHydrated } from '@/state/redux/slices/serversSlice';
import { serverCredentialScope } from '@/utils/servers/registry';
import { listenBrainzCredentialScope } from '@/state/redux/selectors/listenbrainzSelectors';
import { audiomuseCredentialScope } from '@/state/redux/selectors/audiomuseSelectors';
import { downloaderCredentialScope } from '@/state/redux/selectors/downloadersSelectors';
import { DOWNLOADER_IDS } from '@/state/redux/slices/downloadersSlice';


const LIBRARY_LOAD_FAILED_TOAST_ID = 'library-load-failed';

onlineManager.setEventListener(setOnline => {
  return NetInfo.addEventListener(state => {
    setOnline(!!state.isConnected)
  })
})

// Stack.Screen entries under (home) (albumView, artistView, playlistView,
// settings, genreView) don't set freezeOnBlur explicitly, so they fall back
// to this global flag — without it, screens left behind on the stack (e.g.
// an artist view still mounted under a pushed album view) keep re-rendering
// instead of pausing. The (tabs) navigator sets freezeOnBlur explicitly and
// doesn't depend on this.
enableFreeze(true);

SplashScreen.preventAutoHideAsync();

const LIBRARY_ERROR_QUERY_KEYS = new Set<string>([
  QueryKeys.Album,
  QueryKeys.Albums,
  QueryKeys.Artist,
  QueryKeys.Artists,
  QueryKeys.Playlist,
  QueryKeys.Playlists,
  QueryKeys.Tracks,
  QueryKeys.Starred,
  QueryKeys.Genres,
]);

function hasUsableLibraryData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (
    value &&
    typeof value === 'object' &&
    'songs' in value &&
    Array.isArray((value as { songs?: unknown }).songs)
  ) {
    return ((value as { songs: unknown[] }).songs).length > 0;
  }
  return value !== null && value !== undefined;
}

function hasCachedLibraryDataForServer(queryKey: readonly unknown[]): boolean {
  const serverId = queryKey[1];
  if (typeof serverId !== 'string') return false;

  return queryClient
    .getQueryCache()
    .findAll()
    .some(query => {
      const [rootKey, cachedServerId] = query.queryKey;
      return (
        typeof rootKey === 'string' &&
        cachedServerId === serverId &&
        LIBRARY_ERROR_QUERY_KEYS.has(rootKey) &&
        hasUsableLibraryData(query.state.data)
      );
    });
}

function isQueryForActiveServer(queryKey: readonly unknown[]): boolean {
  const serverId = queryKey[1];
  if (typeof serverId !== 'string') return false;
  return store.getState().servers.activeServerId === serverId;
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // A fetch-level failure (host unreachable, aborted by our timeout) marks
      // the server unreachable; ServerReachabilityWatcher then pings to confirm
      // and clears the flag on the first success, so a one-off blip
      // self-corrects within seconds.
      //
      // Scoped to the active server, because `isLikelyNetworkError` reads the
      // message and cannot tell *whose* host was unreachable. Deezer, Last.fm,
      // ListenBrainz and MusicBrainz all fetch from here too, and a Deezer
      // outage raising "can't reach your server" is a banner about the wrong
      // machine — pointing the user at a server that is working fine.
      if (isLikelyNetworkError(error) && isQueryForActiveServer(query.queryKey)) {
        setServerUnreachable(true);
      }

      // Only show a toast when a query has no cached data — silent background
      // refreshes shouldn't interrupt the user if stale data is still visible.
      const rootKey = query.queryKey[0];
      if (
        typeof rootKey === 'string' &&
        LIBRARY_ERROR_QUERY_KEYS.has(rootKey) &&
        isQueryForActiveServer(query.queryKey) &&
        query.state.data === undefined &&
        !hasCachedLibraryDataForServer(query.queryKey) &&
        !query.meta?.suppressGlobalErrorToast
      ) {
        notify.error(i18n.t('common.libraryLoadFailed'), {
          id: LIBRARY_LOAD_FAILED_TOAST_ID,
        });
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
      gcTime: 1000 * 60 * 60 * 24 * 30,
    },
  },
});

const QUERY_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

// Named for what it persists, not for AsyncStorage — the storage behind it
// is MMKV, in the query cache's own namespace.
const queryPersister = createAsyncStoragePersister({
  storage: queryCacheStorage,
})

const OFFLINE_TOAST_ID = 'offline-banner';

function useImageMemoryCleanup() {
  useEffect(() => {
    runImageCacheMigration();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'background') {
        clearImageMemoryCache();
      }
    });
    const memoryWarningSubscription = AppState.addEventListener('memoryWarning', () => {
      clearImageMemoryCache();
    });

    return () => {
      appStateSubscription.remove();
      memoryWarningSubscription.remove();
    };
  }, []);
}

/**
 * The one-time startup read of the keystore into `credentialCache` (Task
 * 4.4) — every server's own secrets, plus its per-integration ones
 * (ListenBrainz, AudioMuse, each downloader), so `useApi` and the various
 * `use*Config` hooks have real values on their very first render after this
 * resolves. Runs once, after `PersistGate` has already rehydrated
 * `state.servers.servers` from MMKV (see `RootLayout` below), which is what
 * makes the server id list here reliable at the moment this reads it.
 *
 * Dispatches `setCredentialsHydrated(true)` when done, purely so the
 * secret-dependent selectors — which cannot themselves subscribe to
 * `credentialCache`, since it isn't part of the Redux store — have a Redux
 * value to key their re-render off. Before this resolves, `getCredentials`
 * returns `{}` for every scope; that reads exactly like "not signed in", so
 * `useApi`'s adapter fails its ping and the app renders the same
 * disconnected state it would for a server with no credentials at all.
 */
function useCredentialHydration() {
  const dispatch = useDispatch();
  useEffect(() => {
    const servers = store.getState().servers.servers;
    const scopes: CredentialScope[] = servers.flatMap(server => [
      serverCredentialScope(server.id),
      listenBrainzCredentialScope(server.id),
      audiomuseCredentialScope(server.id),
      ...DOWNLOADER_IDS.map(id => downloaderCredentialScope(id, server.id)),
    ]);
    hydrateAll(scopes).finally(() => dispatch(setCredentialsHydrated(true)));
  }, [dispatch]);
}

function AppShell() {
  const { resolved, isDarkMode } = useTheme();
  const language = useSelector(selectLanguage);
  useImageMemoryCleanup();
  useCredentialHydration();
  // Mounted here, not on the settings screen that owns the import UI: the
  // certificate has to be applied at startup and re-applied on every change of
  // active server, both of which happen with Settings closed. Mounted only
  // there, a server switch left the previous server's identity in place.
  useClientCertificate();

  useEffect(() => {
    if (i18n.language !== language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      if (!state.isConnected) {
        notify.info(i18n.t('common.offline.noConnection'), {
          id: OFFLINE_TOAST_ID,
          duration: Infinity,
        });
      } else {
        notify.dismiss(OFFLINE_TOAST_ID);
      }
    });
    return unsub;
  }, []);

  return (
    <ThemeProvider value={resolved === 'dark' ? DarkTheme : DefaultTheme}>
      <DownloadProvider>
        <DlnaProvider>
        <PlaybackSinkProvider>
        <PlayingProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <ErrorBoundary>
              <BottomSheetModalProvider>
                <SongActionSheetProvider>
                <PlayerExpansionProvider>
                <Stack>
                  <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                  <Stack.Screen name="(home)" options={{ headerShown: false }} />
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                </Stack>

                {/* Above every screen and the dock, below the sheet portal:
                  * the player covers the app, and the option sheets it opens
                  * still come up over the player. */}
                <PlayerHost />

                <StatusBar style={isDarkMode ? 'light' : 'dark'} />

                <ToastHost />
                </PlayerExpansionProvider>
                </SongActionSheetProvider>
              </BottomSheetModalProvider>
              </ErrorBoundary>
            </GestureHandlerRootView>
        </PlayingProvider>
        </PlaybackSinkProvider>
        </DlnaProvider>
      </DownloadProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('@assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    SplashScreen.setOptions({ duration: motion.progress, fade: true });
  }, []);

  useEffect(() => {
    const jsErrorHandler = (error: { name: string; message: string }, isFatal: boolean) => {
      if (isFatal) {
        Alert.alert(
          i18n.t('common.error.unexpected'),
          i18n.t('common.error.details', { name: error.name, message: error.message }),
          [{ text: i18n.t('common.error.restart'), onPress: () => RNRestart.Restart() }]
        );
      }
    };

    setJSExceptionHandler(jsErrorHandler, true);
    setNativeExceptionHandler(() => { }, false, true);
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: QUERY_CACHE_MAX_AGE,
      }}
    >
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <OfflineMutationReplayer />
          <AppShell />
        </PersistGate>
      </Provider>
    </PersistQueryClientProvider>
  );
}
