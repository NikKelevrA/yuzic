import React, { useCallback, useRef } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Download, Ellipsis } from 'lucide-react-native';

import { DetailHeaderBar, DetailHeaderIconButton } from '@/components/DetailHeader';
import DownloadsListOptions, { type DownloadsOptionsHandle } from '@/components/options/DownloadsOptions';
import EmptyState from '@/components/EmptyState';
import { useDownloaderStates } from '@/features/downloaders/registry';
import { useDownloadersQueue } from '@/features/downloaders/DownloadersQueueContext';
import { useScrollClearance } from '@/features/theme/useScrollClearance';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize } from '@/constants/design';
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
  const router = useRouter();
  const scrollClearance = useScrollClearance();
  const states = useDownloaderStates();
  const connected = states.filter(state => state.isConnected);
  const { queues, refresh } = useDownloadersQueue();
  // Opened through its handle rather than by flipping a boolean that may
  // already hold the value a press would set — see `DownloadsListOptions`.
  const listSheetRef = useRef<DownloadsOptionsHandle>(null);
  // Stable, so the open sheet's props don't change on every queue poll.
  const openConnections = useCallback(() => router.push('/settings/connectionsView'), [router]);
  const inFlight = queues.reduce((sum, queue) => sum + queue.items.length, 0);

  return (
    <SafeAreaView
      testID="downloads-screen"
      edges={['top']}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <DetailHeaderBar
        title={t('downloads.title')}
        subtitle={inFlight > 0 ? t('library.count.items', { count: inFlight }) : undefined}
        // Only where there is a queue to act on: a "…" over an empty screen
        // offers to refresh nothing.
        rightAction={connected.length > 0 ? (
          <DetailHeaderIconButton
            onPress={() => listSheetRef.current?.present()}
            accessibilityLabel={t('a11y.common.moreOptions')}
          >
            <Ellipsis size={iconSize.header} color={colors.secondary} />
          </DetailHeaderIconButton>
        ) : undefined}
      />
      {connected.length === 0 ? (
        <EmptyState
          icon={<Download size={iconSize.emptyState} color={colors.subtext} />}
          message={t('downloads.noDownloaders')}
          // Where downloaders are connected, rather than a sentence pointing there.
          action={{ label: t('downloads.setUpDownloader'), onPress: () => router.push('/settings/connectionsView') }}
        />
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

      {/* Mounted for as long as the screen is, opened through its handle. */}
      <DownloadsListOptions
        ref={listSheetRef}
        title={t('downloads.title')}
        subtitle={inFlight > 0 ? t('library.count.items', { count: inFlight }) : undefined}
        onRefresh={refresh}
        onManage={openConnections}
      />
    </SafeAreaView>
  );
};

export default DownloadsScreen;

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
