import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { notify } from '@/components/toast';

import SettingsScreen from '../../components/SettingsScreen';
import SettingsCardHeader from '../../components/SettingsCardHeader';
import SettingsAuthCard from '../../components/SettingsAuthCard';
import SettingsDisconnectButton from '../../components/SettingsDisconnectButton';
import * as playlistImport from '@/providers/integration/playlistImport';

import {
  selectPlaylistImportServerUrl,
  selectPlaylistImportEnabled,
  selectPlaylistImportAuthenticated,
} from '@/state/redux/selectors/playlistImportSelectors';
import {
  setPlaylistImportServerUrl,
  setPlaylistImportAuthenticated,
  connectPlaylistImport,
  disconnectPlaylistImport,
} from '@/state/redux/slices/playlistImportSlice';

import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';

/**
 * Unlike every other screen this mirrors (AudioMuse, ListenBrainz), there is
 * no credential field here at all — see the note on `PlaylistImportConnection`.
 * A server URL is the whole config, and the "connection" this tests is really
 * just "is the watchlist proxy reachable and does it know about a Navidrome
 * user with this name" — `targetUser` comes from the active server's own
 * username, the same value `usePlaylistImportSync` polls with.
 */
const PlaylistImportView: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id ?? '';
  const targetUser = activeServer?.username ?? '';

  const serverUrl = useSelector(selectPlaylistImportServerUrl);
  const isEnabled = useSelector(selectPlaylistImportEnabled);
  const isAuthenticated = useSelector(selectPlaylistImportAuthenticated);
  const config = useMemo(() => ({ serverUrl, targetUser }), [serverUrl, targetUser]);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!serverUrl || !targetUser) {
      dispatch(setPlaylistImportAuthenticated({ serverId, value: false }));
      return;
    }
    if (isAuthenticated) {
      if (!isEnabled) dispatch(connectPlaylistImport({ serverId }));
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (config.serverUrl && config.targetUser) {
          await playlistImport.testConnection(config);
          if (!cancelled) dispatch(connectPlaylistImport({ serverId }));
        }
      } catch {
        if (!cancelled) {
          dispatch(setPlaylistImportAuthenticated({ serverId, value: false }));
          notify.error(t('settings.playlistImport.connectionFailed'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [config, dispatch, isAuthenticated, isEnabled, serverId, serverUrl, targetUser, t]);

  const handlePing = useCallback(async () => {
    if (!config.serverUrl || !config.targetUser || isLoading) return;
    setIsLoading(true);
    try {
      await playlistImport.testConnection(config);
      dispatch(connectPlaylistImport({ serverId }));
    } catch {
      dispatch(setPlaylistImportAuthenticated({ serverId, value: false }));
      notify.error(t('settings.playlistImport.connectionFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [config, dispatch, isLoading, serverId, t]);

  const handleDisconnect = () => {
    dispatch(disconnectPlaylistImport({ serverId }));
    notify.info(t('settings.playlistImport.disconnected'));
  };

  if (!activeServer) return null;

  return (
    <SettingsScreen title={t('settings.playlistImport.title')}>
      <SettingsCardHeader subtle title={t('settings.playlistImport.credentialsHelper')} />
      <SettingsAuthCard
        fields={[
          {
            label: t('settings.playlistImport.serverUrl'),
            value: serverUrl,
            onChangeText: v => dispatch(setPlaylistImportServerUrl({ serverId, value: v })),
            placeholder: t('settings.playlistImport.serverUrlPlaceholder'),
          },
        ]}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        connectivityLabel={t('settings.playlistImport.connectivity')}
        onConnectivityPress={handlePing}
      />

      {!targetUser && (
        <SettingsCardHeader subtle title={t('settings.playlistImport.noUsername')} />
      )}

      {isAuthenticated && (
        <SettingsDisconnectButton
          label={t('settings.playlistImport.disconnect')}
          onPress={handleDisconnect}
        />
      )}
    </SettingsScreen>
  );
};

export default PlaylistImportView;
