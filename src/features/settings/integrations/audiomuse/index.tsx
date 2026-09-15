import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { notify } from '@/components/toast';

import SettingsScreen from '../../components/SettingsScreen';
import SettingsCardHeader from '../../components/SettingsCardHeader';
import SettingsAuthCard from '../../components/SettingsAuthCard';
import SettingsDisconnectButton from '../../components/SettingsDisconnectButton';
import * as audiomuse from '@/providers/integration/audiomuse';

import {
  selectAudiomuseServerUrl,
  selectAudiomuseEnabled,
  selectAudiomuseAuthenticated,
  useAudiomuseApiToken,
  audiomuseCredentialScope,
} from '@/state/redux/selectors/audiomuseSelectors';
import {
  setAudiomuseServerUrl,
  setAudiomuseAuthenticated,
  connectAudiomuse,
  disconnectAudiomuse,
} from '@/state/redux/slices/audiomuseSlice';

import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';
import { setCredential, forgetCredentials } from '@/state/credentialCache';

const AudiomuseView: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const activeServer = useSelector(selectActiveServer);
  const serverId = activeServer?.id ?? '';

  const serverUrl = useSelector(selectAudiomuseServerUrl);
  // The API token skips Redux entirely — see the same note in the
  // ListenBrainz settings screen.
  const cachedApiToken = useAudiomuseApiToken();
  const [apiToken, setLocalApiToken] = useState(cachedApiToken);
  useEffect(() => { setLocalApiToken(cachedApiToken); }, [cachedApiToken]);
  const isEnabled = useSelector(selectAudiomuseEnabled);
  const isAuthenticated = useSelector(selectAudiomuseAuthenticated);
  const config = useMemo(() => ({ serverUrl, apiToken }), [serverUrl, apiToken]);

  const [isLoading, setIsLoading] = useState(false);

  const handleApiTokenChange = (value: string) => {
    setLocalApiToken(value);
    dispatch(setAudiomuseAuthenticated({ serverId, value: false }));
    void setCredential(audiomuseCredentialScope(serverId), 'apiKey', value);
  };

  useEffect(() => {
    if (!serverUrl || !apiToken) {
      dispatch(setAudiomuseAuthenticated({ serverId, value: false }));
      return;
    }
    if (isAuthenticated) {
      if (!isEnabled) dispatch(connectAudiomuse({ serverId }));
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        if (config.serverUrl && config.apiToken) {
          await audiomuse.testConnection(config);
          if (!cancelled) dispatch(connectAudiomuse({ serverId }));
        }
      } catch {
        if (!cancelled) {
          dispatch(setAudiomuseAuthenticated({ serverId, value: false }));
          notify.error(t('settings.audiomuse.connectionFailed'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 500);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [apiToken, config, dispatch, isAuthenticated, isEnabled, serverId, serverUrl, t]);

  const handlePing = useCallback(async () => {
    if (!config.serverUrl || !config.apiToken || isLoading) return;
    setIsLoading(true);
    try {
      await audiomuse.testConnection(config);
      dispatch(connectAudiomuse({ serverId }));
    } catch {
      dispatch(setAudiomuseAuthenticated({ serverId, value: false }));
      notify.error(t('settings.audiomuse.connectionFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [config, dispatch, isLoading, serverId, t]);

  const handleDisconnect = () => {
    dispatch(disconnectAudiomuse({ serverId }));
    setLocalApiToken('');
    void forgetCredentials(audiomuseCredentialScope(serverId));
    notify.info(t('settings.audiomuse.disconnected'));
  };

  if (!activeServer) return null;

  return (
    <SettingsScreen title={t('settings.audiomuse.title')}>
      <SettingsCardHeader subtle title={t('settings.audiomuse.credentialsHelper')} />
      <SettingsAuthCard
        fields={[
          { label: t('settings.audiomuse.serverUrl'), value: serverUrl, onChangeText: v => dispatch(setAudiomuseServerUrl({ serverId, value: v })), placeholder: t('settings.audiomuse.serverUrlPlaceholder') },
          { label: t('settings.audiomuse.apiToken'), value: apiToken, onChangeText: handleApiTokenChange, placeholder: t('settings.audiomuse.apiTokenPlaceholder'), secureTextEntry: true },
        ]}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        connectivityLabel={t('settings.audiomuse.connectivity')}
        onConnectivityPress={handlePing}
      />

      {isAuthenticated && (
        <SettingsDisconnectButton
          label={t('settings.audiomuse.disconnect')}
          onPress={handleDisconnect}
        />
      )}
    </SettingsScreen>
  );
};

export default AudiomuseView;
