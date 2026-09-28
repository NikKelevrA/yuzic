import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsToggleGroup from '../components/SettingsToggleGroup';
import SettingsCardHeader from '../components/SettingsCardHeader';
import { ThemeColor } from './components/ThemeColor';
import { ThemePalette } from './components/ThemePalette';
import { BackgroundSelector } from './components/BackgroundSelector';
import { ThemeModeSelector } from './components/ThemeModeSelector';
import { PlayingBarActionSelector } from './components/PlayingBarActionSelector';
import { PlayerLayoutSelector } from './components/PlayerLayoutSelector';
import { GridColumns } from './components/GridColumns';
import { RadiusPresetSelector } from './components/RadiusPresetSelector';
import { ListDensitySelector } from './components/ListDensitySelector';
import { TextSizeSelector } from './components/TextSizeSelector';
import { useAppearanceToggles } from './useAppearanceToggles';

/** The appearance pages, in the order the index lists them. */
export const APPEARANCE_SECTIONS = ['colours', 'background', 'player', 'layout', 'dock'] as const;
export type AppearanceSectionId = (typeof APPEARANCE_SECTIONS)[number];

export function isAppearanceSection(value: unknown): value is AppearanceSectionId {
  return typeof value === 'string' && (APPEARANCE_SECTIONS as readonly string[]).includes(value);
}

/**
 * One appearance page's controls.
 *
 * Appearance was one page of some thirty controls, and each new option made
 * the others harder to find. It is split by what a person is trying to change:
 * the colours, what the screens are drawn over, the player, the shape and size
 * of things, and the dock and how the app feels to touch.
 */
export const AppearanceSection: React.FC<{ section: AppearanceSectionId }> = ({ section }) => {
  const { t } = useTranslation();
  const toggles = useAppearanceToggles();

  switch (section) {
    case 'colours':
      return (
        <>
          <ThemeModeSelector />
          <ThemeColor />
          <SettingsToggleGroup items={toggles.accentItems} />
          <SettingsToggleGroup items={toggles.coverAccentItems} />
          <ThemePalette />
        </>
      );
    case 'background':
      return <BackgroundSelector />;
    case 'player':
      // Which controls the player draws is a question about what the app
      // looks like, so it is here rather than in Playback beside crossfade
      // and the equalizer. Playback is what you hear; Appearance is what you see.
      return (
        <>
          <PlayerLayoutSelector />
          <SettingsToggleGroup items={toggles.playerControlItems} />
          <SettingsToggleGroup items={toggles.qualityBadgeItems} />
          <PlayingBarActionSelector />
        </>
      );
    case 'layout':
      // Two groups, because the page holds two different questions. Text size
      // is "can I read this" — an accessibility control, and a local override
      // of one the system already has. The rest are "how much do I want on
      // screen", which is a matter of appetite and has no system equivalent.
      // They read as one setting when stacked, and the combination that makes
      // them look mergeable — large text with tight rows — is exactly the one
      // someone with low vision needs and would lose.
      return (
        <>
          <SettingsCardHeader title={t('settings.appearance.groups.text')} />
          <TextSizeSelector />

          <SettingsCardHeader title={t('settings.appearance.groups.layout')} />
          <ListDensitySelector />
          <RadiusPresetSelector />
          <GridColumns />
          <SettingsToggleGroup items={toggles.sourceHeaderItems} />
        </>
      );
    case 'dock':
      return <SettingsToggleGroup items={toggles.feelItems} />;
  }
};
