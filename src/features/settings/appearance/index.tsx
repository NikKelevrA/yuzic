import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, LayoutGrid, Palette, PanelBottom, Play } from 'lucide-react-native';
import SettingsScreen from '../components/SettingsScreen';
import SettingsCard from '../components/SettingsCard';
import SettingsDivider from '../components/SettingsDivider';
import SettingsRow from '../components/SettingsRow';
import { LanguageSelector } from './components/LanguageSelector';
import { ProfileSelector } from './components/ProfileSelector';
import { APPEARANCE_SECTIONS, type AppearanceSectionId } from './AppearanceSection';
import { useTheme } from '@/features/theme/useTheme';
import { useIconSize } from '@/features/theme/useIconSize';

const ICONS: Record<AppearanceSectionId, React.ComponentType<{ size?: number; color?: string }>> = {
  colours: Palette,
  background: Image,
  player: Play,
  layout: LayoutGrid,
  dock: PanelBottom,
};

/**
 * Appearance: which profile is being edited, the language, then a row per page
 * of what can be changed.
 *
 * The profile comes first because it scopes every page below it — those pages
 * edit whichever look this row names.
 */
const AppearanceSettings: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const icons = useIconSize();

  return (
    <SettingsScreen title={t('settings.appearance.title')}>
      <ProfileSelector />
      <LanguageSelector />
      <SettingsCard>
        {APPEARANCE_SECTIONS.map((section, index) => {
          const Icon = ICONS[section];
          return (
            <React.Fragment key={section}>
              {index > 0 && <SettingsDivider />}
              <SettingsRow
                testID={`appearance-${section}`}
                label={t(`settings.appearance.sections.${section}`)}
                leftIcon={<Icon size={icons.row} color={colors.subtext} />}
                onPress={() => router.push({ pathname: '/settings/appearanceSectionView', params: { section } })}
              />
            </React.Fragment>
          );
        })}
      </SettingsCard>
    </SettingsScreen>
  );
};

export default AppearanceSettings;
