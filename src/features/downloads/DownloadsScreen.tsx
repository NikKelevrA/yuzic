import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import SettingsScreen from '../settings/components/SettingsScreen';
import SettingsCard from '../settings/components/SettingsCard';
import DownloaderQueueCard from '../settings/downloaders/DownloaderQueueCard';
import { useDownloaderStates } from '@/features/downloaders/registry';
import { useDownloadersQueue } from '@/features/downloaders/DownloadersQueueContext';
import { useTheme } from '@/features/theme/useTheme';
import { spacing, typography } from '@/constants/design';

/**
 * The Downloads screen is **server transfers only** — the live acquisition
 * queue of every connected downloader (Lidarr, slskd, SoulSync), each showing
 * every job its queue endpoint reports, including jobs started outside Yuzic.
 *
 * On-device saved music does NOT live here: that is the Library's "Downloaded"
 * view, which is a filter over what you already own. The two were merged onto
 * one screen once and read as one confusing pile of "downloads"; they are
 * different things — one is storage you hold, the other is work in flight — so
 * they live apart. This screen never shows offline storage stats.
 *
 * Live per-downloader counts come from the single shared `useDownloadersQueue()`
 * poll (mounted once in the home layout); the per-card `DownloaderQueueCard`
 * still does its own item-level read via `useDownloaderQueue`, so this screen
 * does not spin up a further poll of its own.
 *
 * Reachable from the Home "downloads in progress" banner and Library's
 * "Downloads" row.
 */
const DownloadsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const states = useDownloaderStates();
  const connected = states.filter((s) => s.isConnected);
  const { queues } = useDownloadersQueue();

  return (
    <SettingsScreen title={t('downloads.title')}>
      {connected.length === 0 && (
        <SettingsCard>
          <Text style={[styles.empty, { color: colors.subtext }]}>
            {t('downloads.noDownloaders')}
          </Text>
        </SettingsCard>
      )}

      {connected.map((state) => {
        // One card per connected downloader, drawn the same way. This was a
        // three-way `if (id === ...)`, each branch naming a downloader and
        // hand-wiring its fetch, its cancel and its row renderer — in a file
        // whose subject is layout. All three now come off the definition and
        // the shared queue.
        const snapshot = queues.find((queue) => queue.id === state.def.id);
        return (
          <DownloaderQueueCard
            key={state.def.id}
            id={state.def.id}
            title={state.def.label}
            items={snapshot?.items ?? []}
            isLoading={snapshot?.isLoading ?? true}
            hasError={snapshot?.hasError ?? false}
            cancelItem={
              state.def.cancelQueueItem
                ? (item) => state.def.cancelQueueItem!(state.config, item)
                : undefined
            }
          />
        );
      })}
    </SettingsScreen>
  );
};

export default DownloadsScreen;

const styles = StyleSheet.create({
  empty: { ...typography.rowSubtitle, textAlign: 'center', marginVertical: spacing.lg },
});
