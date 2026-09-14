import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';

import SettingsScreen from '../components/SettingsScreen';
import SettingsCard from '../components/SettingsCard';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsToggleGroup from '../components/SettingsToggleGroup';
import { useOnlineServices } from './useOnlineSources';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useTheme } from '@/features/theme/useTheme';
import { spacing, typography } from '@/constants/design';

/**
 * Online sources: every outside service, what it's used for, and what it is
 * sent. All start off — your library and server work without any of them.
 *
 * Opened with `?source=<id>` (from Home settings' "is off" rows) it scrolls
 * that service's card into view.
 */
const OnlineSourcesSettings: React.FC = () => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const services = useOnlineServices();
  const isOffline = useIsOffline();
  const { source } = useLocalSearchParams<{ source?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToSource = useRef(false);

  const onCardLayout = useCallback((id: string) => (event: LayoutChangeEvent) => {
    if (id !== source || scrolledToSource.current) return;
    scrolledToSource.current = true;
    scrollRef.current?.scrollTo({ y: event.nativeEvent.layout.y, animated: false });
  }, [source]);

  return (
    <SettingsScreen title={t('settings.sources.title')} scrollRef={scrollRef}>
      <Text style={[styles.caption, { color: colors.subtext }]}>{t('settings.sources.explanation')}</Text>
      {isOffline && (
        <Text testID="online-sources-offline" style={[styles.caption, { color: colors.subtext }]}>
          {t('settings.sources.offline')}
        </Text>
      )}
      {services.map(service => (
        <View key={service.id} testID={`online-source-${service.id}`} onLayout={onCardLayout(service.id)}>
          <SettingsCardHeader subtle title={service.name} />
          <SettingsCard>
            <SettingsToggleGroup items={service.toggles} />
          </SettingsCard>
          <Text style={[styles.caption, styles.sends, { color: colors.subtext }]}>{service.sends}</Text>
        </View>
      ))}
    </SettingsScreen>
  );
};

export default OnlineSourcesSettings;

const styles = StyleSheet.create({
  caption: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sends: {
    marginTop: -spacing.sm,
  },
});
