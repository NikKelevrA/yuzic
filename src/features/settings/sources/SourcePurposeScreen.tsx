import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { useTranslation } from 'react-i18next';

import { spacing, typography } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';
import { availableUsesFor, SOURCE_SCREENS } from '@/providers/registry/sources';
import SettingsScreen from '../components/SettingsScreen';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SourceUseList from './SourceUseList';

type Props = {
  screen: 'metadata' | 'pages';
};

/** A settings screen that is one source list per purpose — Metadata and Pages. */
export default function SourcePurposeScreen({ screen }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <SettingsScreen title={t(`settings.${screen}.title`)}>
      <Text style={[styles.caption, { color: colors.subtext }]}>{t(`settings.${screen}.explanation`)}</Text>
      {/* A purpose every source of which this build lacks a key for is left
          out whole, header included — an empty card under a heading reads as
          a list that failed to load rather than one that cannot exist here. */}
      {SOURCE_SCREENS[screen]
        .filter(purpose => availableUsesFor(purpose).length > 0)
        .map(purpose => (
          <React.Fragment key={purpose}>
            <SettingsCardHeader subtle title={t(`settings.sourcePurposes.${purpose}`)} />
            <SourceUseList purpose={purpose} />
          </React.Fragment>
        ))}
    </SettingsScreen>
  );
}

const styles = StyleSheet.create({
  caption: {
    ...typography.caption,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
});
