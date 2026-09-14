import { useMemo } from "react";
import { useSelector } from "react-redux";
import { ApiAdapter } from "../contracts/ServerAdapter";
import { SERVER_PROVIDERS, withServerCredentials } from "@/utils/servers/registry";
import { selectActiveServer, selectCredentialsHydrated } from "@/state/redux/selectors/serversSelectors";

const empty = async () => {
  throw new Error("No server connected.");
};

const EMPTY_ADAPTER: ApiAdapter = {
  auth: {
    connect: empty,
    ping: empty,
    testUrl: empty,
    startScan: empty,
    disconnect: empty,
  },
  albums: {
    list: async () => [],
    get: empty,
  },
  artists: {
    list: async () => [],
    get: empty,
  },
  genres: {
    list: empty,
  },
  playlists: {
    list: async () => [],
    get: empty,
    create: empty,
    rename: empty,
    addSong: empty,
    removeSong: empty,
    delete: empty,
  },
  starred: {
    list: empty,
    add: empty,
    remove: empty,
  },
  songs: {
    get: async () => null,
    scrobble: async () => {},
    buildStreamUrl: () => '',
    scrobbleKind: 'scrobble',
    streamableCodecs: ['mp3'],
  },
  tracks: {
    list: async () => [],
    get: async () => null,
  },
  similar: {
    getSimilarSongs: async () => [],
  },
  lyrics: {
    getBySongId: empty,
  },
  search: {
    search: async () => ({ albums: [], artists: [], songs: [] })
  }
};

export const useApi = (): ApiAdapter => {
  const activeServer = useSelector(selectActiveServer);
  // Not read directly — its only job is to be a dependency that changes once
  // the startup keystore read lands, so the adapter is rebuilt with real
  // secrets instead of staying on the empty bundle `withServerCredentials`
  // sees beforehand. See `ServersState.credentialsHydrated`.
  const credentialsHydrated = useSelector(selectCredentialsHydrated);

  return useMemo(() => {
    if (!activeServer || !activeServer.isAuthenticated) return EMPTY_ADAPTER;
    const server = withServerCredentials(activeServer);
    return SERVER_PROVIDERS[activeServer.type]?.createAdapter(server) ?? EMPTY_ADAPTER;
  }, [activeServer, credentialsHydrated]);
};
