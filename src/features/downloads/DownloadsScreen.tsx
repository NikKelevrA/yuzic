import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { DetailHeaderBar } from '@/components/DetailHeader';
import EmptyState from '@/components/EmptyState';
import { useDownloaderStates } from '@/features/downloaders/registry';
import { useDownloadersQueue } from '@/features/downloaders/DownloadersQueueContext';
import { useScrollClearance } from '@/features/theme/useScrollClearance';
import { useTheme } from '@/features/theme/useTheme';
import DownloaderQueueSection from './DownloaderQueueSection';

/**
 * The Downloads screen is **server transfers only** — the live acquisition
 * queue of every connected downloader (Lidarr, slskd, SoulSync), each showing
 * every job its queue endpoint reports, including jobs started outside Yuzic.
 *
 * Saved music on this device is the library's Downloaded collection, not this
 * screen: one is what you hold, the other is work in flight.
 *
 * Built like a library screen rather than a settings page. It used to be a
 * stack of settings cards — a boxed list with nothing to press, reached from
 * the library and looking like it belonged somewhere else. Each downloader is
 * a section now, and a transfer for an album you already have opens it.
 *
 * Live per-downloader state comes from the single shared `useDownloadersQueue()`
 * poll mounted in the home layout; this screen starts no poll of its own.
 */
const DownloadsScreen: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const scrollClearance = useScrollClearance();
  const states = useDownloaderStates();
  const connected = states.filter(state => state.isConnected);
  const { queues } = useDownloadersQueue();

  return (
    <SafeAreaView
      testID="downloads-screen"
      edges={['top']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <DetailHeaderBar title={t('downloads.title')} />
      {connected.length === 0 ? (
        <EmptyState message={t('downloads.noDownloaders')} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: scrollClearance }}>
          {connected.map(state => {
            const snapshot = queues.find(queue => queue.id === state.def.id);
            return (
              <DownloaderQueueSection
                key={state.def.id}
                id={state.def.id}
                title={state.def.label}
                items={snapshot?.items ?? []}
                isLoading={snapshot?.isLoading ?? true}
                hasError={snapshot?.hasError ?? false}
                cancelItem={
                  state.def.cancelQueueItem
                    ? item => state.def.cancelQueueItem!(state.config, item)
                    : undefined
                }
              />
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

export default DownloadsScreen;

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
