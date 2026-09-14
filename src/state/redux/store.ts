import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import { reduxStorage as storage } from '@/state/mmkvStorage';

import serversReducer from './slices/serversSlice';
import downloadersReducer from './slices/downloadersSlice';
import audiomuseReducer from './slices/audiomuseSlice';
import settingsAppearanceReducer from '@/features/settings/appearance/state';
import settingsHomeReducer from '@/features/settings/home/state';
import settingsSearchReducer from '@/features/settings/search/state';
import settingsMetadataReducer from '@/features/settings/metadata/state';
import settingsLyricsReducer from '@/features/settings/lyrics/state';
import settingsScrobblingReducer from '@/features/settings/scrobbling/state';
import settingsPlaybackReducer from '@/features/settings/playback/state';
import settingsDownloadsReducer from '@/features/settings/downloads/state';
import settingsSyncReducer from '@/features/settings/sync/state';
import settingsOnboardingReducer from '@/features/settings/onboarding/state';
import listenbrainzReducer from './slices/listenbrainzSlice';
import playbackReducer from './slices/playbackSlice';
import statsReducer from './slices/statsSlice';
import offlineMutationsReducer from './slices/offlineMutationsSlice';
import searchHistoryReducer, { normalizeSearchHistoryEntries } from './slices/searchHistorySlice';
import wantsReducer from './slices/wantsSlice';

// Returns undefined (→ initialState) only on version bump; otherwise passes state through.
const resetMigrate = (state: any, currentVersion: number): Promise<any> => {
  if (state?._persist?.version === currentVersion) return Promise.resolve(state);
  return Promise.resolve(undefined);
};

// v1 gave history entries a shape (query vs. opened entity); before that each
// entry was a bare query string. Lift the old strings instead of dropping them.
const searchHistoryMigrate = (state: any, currentVersion: number): Promise<any> => {
  if (state?._persist?.version === currentVersion) return Promise.resolve(state);
  const byServer = state?.byServer;
  if (!byServer) return Promise.resolve(state);
  const migrated: Record<string, unknown> = {};
  for (const [serverId, entries] of Object.entries(byServer)) {
    migrated[serverId] = normalizeSearchHistoryEntries(entries);
  }
  return Promise.resolve({ ...state, byServer: migrated });
};

// `credentialsHydrated` is a per-session clock tick (see serversSlice), not a
// fact about the user's servers — persisting it would let a stale `true` from
// the last session survive into a cold start, before this session's keystore
// read has actually happened, and nothing would ever flip it back on once
// hydration really does land.
const serversPersistConfig = { key: 'servers', storage, blacklist: ['credentialsHydrated'] };
const downloadersPersistConfig = { key: 'downloaders', storage };
const audiomusePersistConfig = { key: 'audiomuse', storage };
// Task 4.3: the settings junk drawer (one `settings` key, 57 unrelated
// fields) is gone — each feature owns its own slice and its own storage key.
// These are new keys under the rewrite's storage namespace: there is no
// legacy `settings` blob to migrate from, so no `migrate` function and no
// version bump here — a fresh install and an upgrading one look the same.
const settingsAppearancePersistConfig = { key: 'settingsAppearance', storage };
const settingsHomePersistConfig = { key: 'settingsHome', storage };
const settingsSearchPersistConfig = { key: 'settingsSearch', storage };
const settingsMetadataPersistConfig = { key: 'settingsMetadata', storage };
const settingsLyricsPersistConfig = { key: 'settingsLyrics', storage };
const settingsScrobblingPersistConfig = { key: 'settingsScrobbling', storage };
const settingsPlaybackPersistConfig = { key: 'settingsPlayback', storage };
const settingsDownloadsPersistConfig = { key: 'settingsDownloads', storage };
const settingsSyncPersistConfig = { key: 'settingsSync', storage };
const settingsOnboardingPersistConfig = { key: 'settingsOnboarding', storage };
// Strips the per-server nowPlayingEnabled key the consolidation pass
// retired — same reasoning as the settings v3 migration.
const listenbrainzMigrate = (state: any, currentVersion: number): Promise<any> => {
  if (state?._persist?.version === currentVersion) return Promise.resolve(state);
  const byServer = state?.byServer;
  if (!byServer) return Promise.resolve(state);
  const cleaned: Record<string, any> = {};
  for (const [serverId, entry] of Object.entries(byServer)) {
    const { nowPlayingEnabled: _np, ...rest } = (entry as Record<string, unknown>) ?? {};
    cleaned[serverId] = rest;
  }
  return Promise.resolve({ ...state, byServer: cleaned });
};

const listenbrainzPersistConfig = {
  key: 'listenbrainz',
  storage,
  version: 1,
  migrate: listenbrainzMigrate,
};
// Playback is written on every track change and (throttled) every few seconds
// during play; a wipe on version bump is fine — the loss is at most whatever
// was mid-play when the app got the update.
const playbackPersistConfig = { key: 'playback', storage, throttle: 3000 };
const offlineMutationsPersistConfig = { key: 'offlineMutations', storage };
const searchHistoryPersistConfig = {
  key: 'searchHistory',
  storage,
  version: 1,
  migrate: searchHistoryMigrate,
};
// Save-only intent store; a saved want is cheap and rare (user taps) so no
// throttle is needed — matches downloaders/servers, which also write as-is.
const wantsPersistConfig = { key: 'wants', storage };

// Persist throttling. redux-persist writes on every dispatched action that
// mutates the slice; for slices that carry thousands of entries (library) or
// change on every second (playback), that's a JSON.stringify + MMKV write per
// action — measurable on cold-boot and playback. Throttling batches writes
// without changing any consumer's behavior.
//
//   playback: 3s — the position tick is throttled inside
//     usePlaybackPersistence to ~5s, but the queue slice also gets rewrites
//     from track advances; 3s catches both without piling up.
//   stats: 1s — an incrementPlay dispatch happens once per track change.
const statsPersistConfig = {
  key: 'stats',
  storage,
  version: 3,
  migrate: resetMigrate,
  throttle: 1000,
};
// Task 4.1 left genres behind in a `library` slice; they are now a catalog
// query like the rest (`useGenres`), so the slice and its persist key are gone.
// The old on-disk payload is simply never read again.

export const rootReducer = combineReducers({
    servers: serversReducer,
    downloaders: downloadersReducer,
    audiomuse: audiomuseReducer,
    settingsAppearance: settingsAppearanceReducer,
    settingsHome: settingsHomeReducer,
    settingsSearch: settingsSearchReducer,
    settingsMetadata: settingsMetadataReducer,
    settingsLyrics: settingsLyricsReducer,
    settingsScrobbling: settingsScrobblingReducer,
    settingsPlayback: settingsPlaybackReducer,
    settingsDownloads: settingsDownloadsReducer,
    settingsSync: settingsSyncReducer,
    settingsOnboarding: settingsOnboardingReducer,
    listenbrainz: listenbrainzReducer,
    playback: playbackReducer,
    stats: statsReducer,
    offlineMutations: offlineMutationsReducer,
    searchHistory: searchHistoryReducer,
    wants: wantsReducer,
});

const persistedReducer = combineReducers({
    servers: persistReducer(serversPersistConfig, serversReducer),
    downloaders: persistReducer(downloadersPersistConfig, downloadersReducer),
    audiomuse: persistReducer(audiomusePersistConfig, audiomuseReducer),
    settingsAppearance: persistReducer(settingsAppearancePersistConfig, settingsAppearanceReducer),
    settingsHome: persistReducer(settingsHomePersistConfig, settingsHomeReducer),
    settingsSearch: persistReducer(settingsSearchPersistConfig, settingsSearchReducer),
    settingsMetadata: persistReducer(settingsMetadataPersistConfig, settingsMetadataReducer),
    settingsLyrics: persistReducer(settingsLyricsPersistConfig, settingsLyricsReducer),
    settingsScrobbling: persistReducer(settingsScrobblingPersistConfig, settingsScrobblingReducer),
    settingsPlayback: persistReducer(settingsPlaybackPersistConfig, settingsPlaybackReducer),
    settingsDownloads: persistReducer(settingsDownloadsPersistConfig, settingsDownloadsReducer),
    settingsSync: persistReducer(settingsSyncPersistConfig, settingsSyncReducer),
    settingsOnboarding: persistReducer(settingsOnboardingPersistConfig, settingsOnboardingReducer),
    listenbrainz: persistReducer(listenbrainzPersistConfig, listenbrainzReducer),
    playback: persistReducer(playbackPersistConfig, playbackReducer),
    stats: persistReducer(statsPersistConfig, statsReducer),
    offlineMutations: persistReducer(offlineMutationsPersistConfig, offlineMutationsReducer),
    searchHistory: persistReducer(searchHistoryPersistConfig, searchHistoryReducer),
    wants: persistReducer(wantsPersistConfig, wantsReducer),
});

const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            immutableCheck: false,
            serializableCheck: false,
        }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
