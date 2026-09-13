import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { notify } from '@/components/toast';

import SettingsScreen from '../../components/SettingsScreen';
import SettingsAuthCard from '../../components/SettingsAuthCard';
import SettingsDisconnectButton from '../../components/SettingsDisconnectButton';
import {
  selectListenBrainzUsername,
  selectListenBrainzAuthenticated,
  useListenBrainzToken,
  listenBrainzCredentialScope,
} from '@/state/redux/selectors/listenbrainzSelectors';
import {
  setUsername,
  setAuthenticated,
  disconnect,
} from '@/state/redux/slices/listenbrainzSlice';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import * as listenbrainz from '@/api/listenbrainz';
import { setCredential, forgetCredentials } from '@/state/credentialCache';

const ListenBrainzView: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id ?? '';

  const username = useSelector(selectListenBrainzUsername);
  // The token, unlike every other field on this screen, never touches Redux —
  // it comes straight from the keystore-backed cache. Local state gives the
  // input its immediate keystroke feedback; `setCredential` is the actual
  // write, fired on every change same as the Redux fields below.
  const cachedToken = useListenBrainzToken();
  const [token, setLocalToken] = useState(cachedToken);
  useEffect(() => { setLocalToken(cachedToken); }, [cachedToken]);
  const isAuthenticated = useSelector(selectListenBrainzAuthenticated);
  const config = username && token ? { username, token } : null;

  const [isLoading, setIsLoading] = useState(false);

  const handleTokenChange = (value: string) => {
    const trimmed = value.trim();
    setLocalToken(trimmed);
    dispatch(setAuthenticated({ serverId, value: false }));
    void setCredential(listenBrainzCredentialScope(serverId), 'token', trimmed);
  };

  useEffect(() => {
    if (!username || !token) {
      dispatch(setAuthenticated({ serverId, value: false }));
      return;
    }
    if (isAuthenticated) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (config) {
          const result = await listenbrainz.testConnection(config);
          if (!cancelled) {
            dispatch(setAuthenticated({ serverId, value: result.success }));
            if (!result.success) notify.error(result.message || t('settings.listenBrainz.connectFailed'));
          }
        }
      } catch {
        if (!cancelled) {
          dispatch(setAuthenticated({ serverId, value: false }));
          notify.error(t('settings.listenBrainz.connectFailed'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [config, dispatch, isAuthenticated, serverId, t, token, username]);

  const handlePing = async () => {
    if (!username || !token) {
      notify.error(t('settings.listenBrainz.missingCredentials'));
      return;
    }
    setIsLoading(true);
    try {
      if (!config) return;
      const result = await listenbrainz.testConnection(config);
      dispatch(setAuthenticated({ serverId, value: result.success }));
      if (result.success) {
        notify.success(t('settings.listenBrainz.connectionSuccessful'));
      } else {
        notify.error(result.message || t('settings.listenBrainz.connectionFailed'));
      }
    } catch {
      dispatch(setAuthenticated({ serverId, value: false }));
      notify.error(t('settings.listenBrainz.connectFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = () => {
    dispatch(disconnect({ serverId }));
    setLocalToken('');
    void forgetCredentials(listenBrainzCredentialScope(serverId));
    notify.info(t('settings.listenBrainz.disconnected'));
  };

  if (!activeServer) return null;

  return (
    <SettingsScreen title={t('settings.listenBrainz.title')}>
      <SettingsAuthCard
        fields={[
          { label: t('settings.listenBrainz.username'), value: username, onChangeText: v => dispatch(setUsername({ serverId, value: v.trim() })), placeholder: t('settings.listenBrainz.usernamePlaceholder') },
          { label: t('settings.listenBrainz.userToken'), value: token, onChangeText: handleTokenChange, placeholder: t('settings.listenBrainz.tokenPlaceholder'), secureTextEntry: true },
        ]}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        connectivityLabel={t('settings.listenBrainz.connectivity')}
        onConnectivityPress={handlePing}
      />

      {isAuthenticated && (
        <SettingsDisconnectButton
          label={t('settings.listenBrainz.disconnect')}
          onPress={handleDisconnect}
        />
      )}
    </SettingsScreen>
  );
};

export default ListenBrainzView;
