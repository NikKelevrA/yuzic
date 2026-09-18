import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { notify } from '@/components/toast';

import { downloaderSelectors, downloaderCredentialScope } from '@/state/redux/selectors/downloadersSelectors';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import {
  connectDownloader,
  disconnectDownloader,
  setDownloaderAuthenticated,
  setDownloaderServerUrl,
  type DownloaderId,
} from '@/state/redux/slices/downloadersSlice';
import { setCredential, forgetCredentials } from '@/state/credentialCache';

/** Debounce before auto-testing typed credentials, so each keystroke isn't a request. */
const AUTO_CONNECT_DELAY_MS = 500;

/**
 * The downloader's failure label plus what the transport actually reported.
 *
 * Every failure used to read identically: a 401 from a wrong key, a 400 from
 * reaching an HTTPS port over http://, an unparseable URL that never left the
 * device, and a timeout all became "connection failed". That is not enough to
 * act on — the reason is the whole difference between "fix the key" and "fix
 * the address", and it was already in hand when the error was discarded.
 */
function failureMessage(label: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? '');
  return detail ? `${label}: ${detail}` : label;
}

export type DownloaderConfig = { serverUrl: string; apiKey: string };

/**
 * Credential state and connection testing for one downloader. Lidarr and slskd
 * differ only in which `testConnection` they call, so the auth effect, the
 * manual ping and the disconnect all live here rather than once per screen.
 */
export function useDownloaderConnection(
  id: DownloaderId,
  testConnection: (config: DownloaderConfig) => Promise<unknown>
) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id ?? '';

  const selectors = downloaderSelectors[id];
  const serverUrl = useSelector(selectors.serverUrl);
  // The API key skips Redux entirely — see the same note in the ListenBrainz
  // settings screen. Local state gives the input immediate keystroke
  // feedback; `setCredential` is the actual write.
  const cachedApiKey = selectors.useApiKey();
  const [apiKey, setLocalApiKey] = useState(cachedApiKey);
  useEffect(() => { setLocalApiKey(cachedApiKey); }, [cachedApiKey]);
  const isAuthenticated = useSelector(selectors.isAuthenticated);
  const config = useMemo<DownloaderConfig>(() => ({ serverUrl, apiKey }), [serverUrl, apiKey]);

  const [isLoading, setIsLoading] = useState(false);

  // See useDownloaderQueue: `t` is a ref so a changing identity can't restart
  // the debounced connection test on every render.
  const translate = useRef(t);
  translate.current = t;

  // Both fields are trimmed on the way in. A URL or key pasted from a password
  // manager or a web page routinely carries a trailing newline or space, and
  // neither is visible in the input — the URL then fails as an unparseable
  // address ("Network request failed", so nothing ever reaches the server) and
  // the key is sent verbatim and rejected with a 401. Both surfaced as a bare
  // "connection failed" against a form that looked perfectly correct.
  const setServerUrl = useCallback(
    (value: string) => dispatch(setDownloaderServerUrl({ serverId, downloader: id, value: value.trim() })),
    [dispatch, id, serverId]
  );
  const setApiKey = useCallback(
    (value: string) => {
      const key = value.trim();
      setLocalApiKey(key);
      dispatch(setDownloaderAuthenticated({ serverId, downloader: id, value: false }));
      // A rejected keystore write used to be discarded by `void`, which left the
      // key absent from both the Keychain and the in-memory cache with nothing
      // said — the field looked filled until the screen remounted blank.
      setCredential(downloaderCredentialScope(id, serverId), 'apiKey', key).catch(() => {
        notify.error(translate.current(`settings.downloaders.${id}.connectionFailed`));
      });
    },
    [dispatch, id, serverId]
  );

  useEffect(() => {
    if (!serverUrl || !apiKey) {
      dispatch(setDownloaderAuthenticated({ serverId, downloader: id, value: false }));
      return;
    }
    if (isAuthenticated) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (config.serverUrl && config.apiKey) {
          await testConnection(config);
          if (!cancelled) dispatch(connectDownloader({ serverId, downloader: id }));
        }
      } catch (error) {
        if (!cancelled) {
          dispatch(setDownloaderAuthenticated({ serverId, downloader: id, value: false }));
          notify.error(failureMessage(translate.current(`settings.downloaders.${id}.connectionFailed`), error));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, AUTO_CONNECT_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [apiKey, config, dispatch, id, isAuthenticated, serverId, serverUrl, testConnection]);

  const ping = useCallback(async () => {
    if (!config.serverUrl || !config.apiKey || isLoading) return;
    setIsLoading(true);
    try {
      await testConnection(config);
      dispatch(connectDownloader({ serverId, downloader: id }));
    } catch (error) {
      dispatch(setDownloaderAuthenticated({ serverId, downloader: id, value: false }));
      notify.error(failureMessage(t(`settings.downloaders.${id}.connectionFailed`), error));
    } finally {
      setIsLoading(false);
    }
  }, [config, dispatch, id, isLoading, serverId, t, testConnection]);

  const disconnect = useCallback(() => {
    dispatch(disconnectDownloader({ serverId, downloader: id }));
    setLocalApiKey('');
    void forgetCredentials(downloaderCredentialScope(id, serverId));
    notify.info(t(`settings.downloaders.${id}.disconnected`));
  }, [dispatch, id, serverId, t]);

  return {
    activeServer,
    serverUrl,
    apiKey,
    setServerUrl,
    setApiKey,
    isAuthenticated,
    isLoading,
    config,
    ping,
    disconnect,
  };
}
