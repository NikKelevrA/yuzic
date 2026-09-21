import React from 'react';
import { useTranslation } from 'react-i18next';

import SettingsScreen from '../components/SettingsScreen';
import SettingsAuthCard from '../components/SettingsAuthCard';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsDisconnectButton from '../components/SettingsDisconnectButton';
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice';
import {
  useDownloaderConnection,
  type DownloaderConfig,
} from './useDownloaderConnection';

type Props = {
  id: DownloaderId;
  testConnection: (config: DownloaderConfig) => Promise<unknown>;
  /**
   * Downloader-specific extras rendered between the auth card and the
   * disconnect button — search preferences, filters, quality profiles,
   * anything that only one downloader has. The live download queue is NOT
   * here: connection settings configure a provider, they don't monitor it.
   * The queue lives on one screen only — the Downloads screen — so it can
   * never drift into two places again.
   */
  extraCards?: React.ReactNode;
  /** Called on disconnect so a screen can drop any extra local state. */
  onDisconnected?: () => void;
  /**
   * For a downloader with no credential — Downtify's API has none at all. The
   * key field is left out rather than shown empty and ignored, and the
   * connection is judged on the address alone.
   */
  keyless?: boolean;
  /**
   * A line above the fields, where a downloader needs one. Most do not: a URL
   * and an API key explain themselves. Downtify does, because it has no API
   * key at all and that is worth saying out loud rather than leaving the user
   * to notice the missing box.
   */
  helperKey?: string;
};

/**
 * Shared shell for the Lidarr and slskd settings screens. The two used to be
 * near-identical copies, which is how slskd ended up silently swallowing queue
 * errors that Lidarr surfaced.
 */
function DownloaderSettingsScreen({
  id,
  testConnection,
  extraCards,
  onDisconnected,
  keyless = false,
  helperKey,
}: Props) {
  const { t } = useTranslation();

  const {
    activeServer,
    serverUrl,
    apiKey,
    setServerUrl,
    setApiKey,
    isAuthenticated,
    isLoading,
    ping,
    disconnect,
  } = useDownloaderConnection(id, testConnection, { keyless });

  const handleDisconnect = () => {
    disconnect();
    onDisconnected?.();
  };

  if (!activeServer) return null;

  return (
    <SettingsScreen title={t(`settings.downloaders.${id}.title`)}>
      {helperKey ? <SettingsCardHeader subtle title={t(helperKey)} /> : null}
      <SettingsAuthCard
        fields={[
          {
            label: t('settings.downloaders.serverUrl'),
            value: serverUrl,
            onChangeText: setServerUrl,
            placeholder: t(`settings.downloaders.serverUrlPlaceholder.${id}`),
          },
          ...(keyless ? [] : [{
            label: t('settings.downloaders.apiKey'),
            value: apiKey,
            onChangeText: setApiKey,
            placeholder: t('settings.downloaders.apiKeyPlaceholder'),
            secureTextEntry: true,
          }]),
        ]}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        connectivityLabel={t('settings.downloaders.connectivity')}
        onConnectivityPress={ping}
      />

      {isAuthenticated && extraCards}

      {isAuthenticated && (
        <SettingsDisconnectButton
          label={t('settings.downloaders.disconnect')}
          onPress={handleDisconnect}
        />
      )}
    </SettingsScreen>
  );
}

export default DownloaderSettingsScreen;
