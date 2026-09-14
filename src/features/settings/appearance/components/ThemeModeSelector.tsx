import React from 'react';
import { Sun, Moon, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { selectThemeMode, setThemeMode, ThemeMode } from '@/features/settings/appearance/state';
import SettingsIconSelectCard from '../../components/SettingsIconSelectCard';
import { iconSize } from '@/constants/design';

const OPTIONS: { id: ThemeMode; icon: React.ReactElement<{ color?: string }> }[] = [
  { id: 'light', icon: <Sun size={iconSize.row} /> },
  { id: 'dark', icon: <Moon size={iconSize.row} /> },
  { id: 'system', icon: <Smartphone size={iconSize.row} /> },
];

export const ThemeModeSelector: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const themeMode = useSelector(selectThemeMode) as ThemeMode;

  return (
    <SettingsIconSelectCard
      title={t('settings.appearance.theme.title')}
      items={OPTIONS.map(o => ({
        id: o.id,
        icon: o.icon,
        label: t(`settings.appearance.theme.${o.id}`),
      }))}
      selected={themeMode}
      onSelect={id => dispatch(setThemeMode(id as ThemeMode))}
    />
  );
};
