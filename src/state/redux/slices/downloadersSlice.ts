import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { removeServer } from '@/state/redux/slices/serversSlice';
import { DEFAULT_SLSKD_PREFERENCES, type SlskdSearchPreferences } from '@/providers/integration/slskd';

export type DownloaderId = 'lidarr' | 'slskd' | 'soulsync' | 'downtify';

export const DOWNLOADER_IDS: DownloaderId[] = ['lidarr', 'slskd', 'soulsync', 'downtify'];

/**
 * `apiKey` is NOT here — it goes to the keystore via `setCredential` (scope
 * `{ kind: 'integration', providerId: 'downloader:<id>:<serverId>' }`, field
 * `apiKey` — see `downloaderCredentialScope` in `downloadersSelectors.ts`)
 * because this slice is persisted to MMKV as plain JSON. The
 * `useDownloaderConfig` hook combines `serverUrl` from here with the key from
 * `credentialCache`.
 */
export interface DownloaderConnection {
  serverUrl: string;
  isAuthenticated: boolean;
  /**
   * Downloader-specific preferences, shaped per implementation. slskd stores
   * `SlskdSearchPreferences` here; lidarr leaves it undefined for now. Kept
   * as an untyped bag on the base connection so the slice stays generic.
   */
  preferences?: Record<string, unknown>;
}

export type PerServerDownloadersState = Record<DownloaderId, DownloaderConnection>;

/**
 * Per-server, per-unit default acquisition provider. Set only through the
 * GetReviewSheet's explicit "save as default" toggle — never implicitly from
 * a Get request — and read back only to *preselect* a provider row; the Get
 * confirm tap still has to happen for a job to start.
 */
interface DownloaderDefaults {
  defaultAlbumProvider?: DownloaderId;
  defaultTrackProvider?: DownloaderId;
  /**
   * Lidarr-only: the quality profile applied when Lidarr has to create the
   * artist for an album Get. Read from Lidarr's own `/qualityprofile` list at
   * Settings > Downloaders setup time; GetReviewSheet pre-fills its per-Get
   * override from this and only writes it back through the "save as default"
   * toggle.
   */
  lidarrDefaultQualityProfileId?: number;
}

interface DownloadersState {
  byServer: Record<string, PerServerDownloadersState>;
  defaultsByServer: Record<string, DownloaderDefaults>;
}

const emptyConnection: DownloaderConnection = {
  serverUrl: '',
  isAuthenticated: false,
};

const defaultPerServer: PerServerDownloadersState = {
  lidarr: emptyConnection,
  slskd: emptyConnection,
  soulsync: emptyConnection,
  // Downtify holds no credential at all, so its `isAuthenticated` means
  // "answered when we asked" rather than "the key was accepted".
  downtify: emptyConnection,
};

const initialState: DownloadersState = {
  byServer: {},
  defaultsByServer: {},
};

function getOrCreate(state: DownloadersState, serverId: string, downloader: DownloaderId): DownloaderConnection {
  if (!state.byServer[serverId]) {
    state.byServer[serverId] = JSON.parse(JSON.stringify(defaultPerServer));
  }
  // Entries persisted before a downloader existed won't have its key yet.
  if (!state.byServer[serverId][downloader]) {
    state.byServer[serverId][downloader] = { ...emptyConnection };
  }
  return state.byServer[serverId][downloader];
}

type DownloaderRef = { serverId: string; downloader: DownloaderId };

const downloadersSlice = createSlice({
  name: 'downloaders',
  initialState,
  reducers: {
    setDownloaderServerUrl(state, action: PayloadAction<DownloaderRef & { value: string }>) {
      const entry = getOrCreate(state, action.payload.serverId, action.payload.downloader);
      entry.serverUrl = action.payload.value;
    },
    setDownloaderAuthenticated(state, action: PayloadAction<DownloaderRef & { value: boolean }>) {
      const entry = getOrCreate(state, action.payload.serverId, action.payload.downloader);
      entry.isAuthenticated = action.payload.value;
    },
    connectDownloader(state, action: PayloadAction<DownloaderRef>) {
      const entry = getOrCreate(state, action.payload.serverId, action.payload.downloader);
      entry.isAuthenticated = true;
    },
    disconnectDownloader(state, action: PayloadAction<DownloaderRef>) {
      const entry = getOrCreate(state, action.payload.serverId, action.payload.downloader);
      entry.serverUrl = '';
      entry.isAuthenticated = false;
      // The user's preferences are theirs — a disconnect is a re-plug, not a
      // reset of their format/quality choices.
    },
    setSlskdPreferences(
      state,
      action: PayloadAction<{ serverId: string; preferences: Partial<SlskdSearchPreferences> }>
    ) {
      const entry = getOrCreate(state, action.payload.serverId, 'slskd');
      const current = (entry.preferences as SlskdSearchPreferences | undefined) ?? DEFAULT_SLSKD_PREFERENCES;
      entry.preferences = { ...current, ...action.payload.preferences };
    },
    /**
     * The only writer of a default provider — called from GetReviewSheet's
     * "save as default" toggle, never from a bare Get request. `provider`
     * undefined clears back to ask-each-time.
     */
    setDefaultProvider(
      state,
      action: PayloadAction<{ serverId: string; unit: 'album' | 'track'; provider: DownloaderId | undefined }>
    ) {
      const { serverId, unit, provider } = action.payload;
      const current = state.defaultsByServer[serverId] ?? {};
      state.defaultsByServer[serverId] = {
        ...current,
        [unit === 'album' ? 'defaultAlbumProvider' : 'defaultTrackProvider']: provider,
      };
    },
    /**
     * The only writer of the per-server Lidarr default quality profile.
     * Written from the Lidarr settings screen's own selector, and from
     * GetReviewSheet's "save as default" toggle when the user bumps the
     * per-Get override and asks to keep it. `qualityProfileId` undefined
     * clears back to Lidarr's own default (profile id 1).
     */
    setDefaultQualityProfileId(
      state,
      action: PayloadAction<{ serverId: string; qualityProfileId: number | undefined }>
    ) {
      const { serverId, qualityProfileId } = action.payload;
      const current = state.defaultsByServer[serverId] ?? {};
      state.defaultsByServer[serverId] = {
        ...current,
        lidarrDefaultQualityProfileId: qualityProfileId,
      };
    },
  },
  /**
   * Forget a server the listener removed.
   *
   * Wired to the action rather than dispatched beside it, because the one
   * caller that removes a server should not have to remember every slice that
   * kept something for it — and the next caller would not.
   */
  extraReducers: builder => {
    builder.addCase(removeServer, (state, action) => {
      delete state.byServer[action.payload];
    });
  },
});

export const {
  setDownloaderServerUrl,
  setDownloaderAuthenticated,
  connectDownloader,
  disconnectDownloader,
  setSlskdPreferences,
  setDefaultProvider,
  setDefaultQualityProfileId,
} = downloadersSlice.actions;

export default downloadersSlice.reducer;
