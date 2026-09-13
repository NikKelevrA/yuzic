import { iconSize, motion, spacing, typography } from '@/constants/design';
import React from 'react';
import { Alert, FlatList, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react-native';
import { notify } from '@/components/toast';

import SettingsCard from '../components/SettingsCard';
import SettingsCardHeader from '../components/SettingsCardHeader';
import DownloaderQueueRow from './DownloaderQueueRow';
import { useQueueRowSubtitle } from './useQueueRowSubtitle';
import { useTheme } from '@/hooks/useTheme';
import type { DownloaderId } from '@/utils/redux/slices/downloadersSlice';
import type { DownloaderQueueItem } from '@/features/downloaders/queueItem';

type Props = {
  id: DownloaderId;
  /**
   * Card title override. The Downloads screen shows the downloader's label
   * ("Lidarr", "Soulseek"); Settings wants the default "Queue".
   */
  title?: string;
  items: DownloaderQueueItem[];
  isLoading: boolean;
  hasError: boolean;
  /** Absent when the downloader offers no way to stop a transfer. */
  cancelItem?: (item: DownloaderQueueItem) => Promise<void>;
};

/**
 * A downloader's transfer queue, rendered.
 *
 * Given its items rather than fetching them. It used to poll on its own, every
 * ten seconds, while a second poller was already reading the same endpoint for
 * the same data — and it took a `fetchQueueWithDiff` and a `renderItem` as
 * props, so the screen above it chose both inside a three-way branch on the
 * downloader's id.
 *
 * What is left here is what a card genuinely is: loading, empty, error, and a
 * list.
 */
export default function DownloaderQueueCard({
  id,
  title,
  items,
  isLoading,
  hasError,
  cancelItem,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const subtitleFor = useQueueRowSubtitle();

  const rotation = useSharedValue(0);
  React.useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: motion.progress, easing: Easing.linear }),
      -1,
      false
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  // Only one row's warnings are open at a time; opening a second closes the
  // first, which is what a list of rows in a card wants.
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const runCancel = React.useCallback(
    async (item: DownloaderQueueItem) => {
      if (!cancelItem) return;
      setCancellingId(item.id);
      try {
        await cancelItem(item);
        notify.success(t('settings.downloaders.cancelled'));
      } catch {
        notify.error(t('settings.downloaders.cancelFailed'));
      } finally {
        setCancellingId((current) => (current === item.id ? null : current));
      }
    },
    [cancelItem, t]
  );

  const confirmCancel = React.useCallback(
    (item: DownloaderQueueItem, label: string) => {
      Alert.alert(
        t('settings.downloaders.cancelTitle'),
        t('settings.downloaders.cancelBody', { title: label }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('settings.downloaders.cancelConfirm'),
            style: 'destructive',
            onPress: () => runCancel(item),
          },
        ]
      );
    },
    [runCancel, t]
  );

  const renderQueueItem = React.useCallback(
    ({ item }: { item: DownloaderQueueItem }) => {
      const warnings = item.warnings ?? [];
      const isExpanded = expandedId === item.id;
      return (
        <DownloaderQueueRow
          title={item.title || t('settings.downloaders.unknown')}
          subtitle={subtitleFor(item)}
          percent={Math.max(0, Math.min(100, Math.round(item.percentComplete)))}
          completed={!item.active}
          cancel={{
            requestCancel: cancelItem
              ? (label: string) => confirmCancel(item, label)
              : undefined,
            isCancelling: cancellingId === item.id,
          }}
          onPress={
            warnings.length > 0
              ? () => setExpandedId(isExpanded ? null : item.id)
              : undefined
          }
          warningMessages={
            warnings.length > 0 && isExpanded
              ? warnings.map((message) => ({ title: message }))
              : undefined
          }
        />
      );
    },
    [cancelItem, cancellingId, confirmCancel, expandedId, subtitleFor, t]
  );

  return (
    <SettingsCard>
      <SettingsCardHeader title={title ?? t('settings.downloaders.queue')} />
      {isLoading ? (
        <Animated.View style={[styles.queueLoading, spinStyle]}>
          <Loader2 size={iconSize.large} color={colors.secondary} />
        </Animated.View>
      ) : hasError ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>
          {t(`settings.downloaders.${id}.connectionFailed`)}
        </Text>
      ) : items.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.subtext }]}>
          {t('settings.downloaders.emptyQueue')}
        </Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderQueueItem}
          scrollEnabled={false}
        />
      )}
    </SettingsCard>
  );
}

const styles = StyleSheet.create({
  queueLoading: { alignItems: 'center', paddingVertical: spacing.roomy },
  emptyText: { ...typography.rowSubtitle, textAlign: 'center', marginVertical: spacing.lg },
});
