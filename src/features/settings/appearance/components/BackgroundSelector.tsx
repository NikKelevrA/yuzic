import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';
import Slider from '@react-native-community/slider';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { Ban, Disc3, ImageIcon } from 'lucide-react-native';

import { iconSize, spacing, typography } from '@/constants/design';
import { notify } from '@/components/toast';
import { editTheme, selectActiveTheme, selectBackgroundUrisInUseElsewhere } from '@/features/settings/appearance/state';
import { pickBackgroundImage, removeBackgroundImage } from '@/features/theme/backgroundImage';
import { DEFAULT_BACKGROUND_CROP, type ScreenBackgroundCrop, type ScreenBackgroundSource } from '@/features/theme/theme';
import { MAX_ZOOM, cropOrDefault, isDefaultCrop, withZoom } from '@/features/theme/backgroundCrop';
import { BackgroundCropEditor } from './BackgroundCropEditor';
import { useTheme } from '@/features/theme/useTheme';
import SettingsCard from '../../components/SettingsCard';
import SettingsDivider from '../../components/SettingsDivider';
import SettingsIconSelectCard from '../../components/SettingsIconSelectCard';
import SettingsRow from '../../components/SettingsRow';

type Choice = ScreenBackgroundSource['kind'];

const SCOPES = ['tabs', 'everywhere'] as const;

// Module-level, so these keep the static token: a hook cannot reach a constant
// declared outside the component. They are fixed-size glyphs in a settings
// picker rather than icons sitting beside a line of body text, so holding
// still is also the right answer here.
const OPTIONS: { id: Choice; icon: React.ReactElement<{ color?: string }> }[] = [
  { id: 'none', icon: <Ban size={iconSize.row} /> },
  { id: 'image', icon: <ImageIcon size={iconSize.row} /> },
  { id: 'cover', icon: <Disc3 size={iconSize.row} /> },
];

/**
 * What the tab screens are drawn over: their plain colour, a photo, or the
 * cover of what is playing; whether that is Home alone or every tab; and how
 * blurred and how veiled the image is.
 *
 * Choosing a photo asks for one straight away, since a photo background with
 * no photo is not a state worth being in. A replaced photo's copy is deleted.
 */
export const BackgroundSelector: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const surface = useSelector(selectActiveTheme).surface;
  const background = surface.background;
  const usedElsewhere = useSelector(selectBackgroundUrisInUseElsewhere);

  const setBackground = (next: ScreenBackgroundSource) => {
    const dropped = background.kind === 'image'
      && (next.kind !== 'image' || next.uri !== background.uri);
    // Only once nothing else is pointing at it. Another profile can be wearing
    // the same photo, and deleting the file would blank that one too.
    if (dropped && !usedElsewhere.has(background.uri)) {
      void removeBackgroundImage(background.uri);
    }
    dispatch(editTheme({ surface: { background: next } }));
  };

  const choosePhoto = async () => {
    try {
      const uri = await pickBackgroundImage();
      // Deliberately no crop: a new photo has nothing in common with the last
      // one's framing, and inheriting it would open on a corner of the picture
      // the person has not seen yet.
      if (uri) setBackground({ kind: 'image', uri });
    } catch {
      notify.error(t('settings.appearance.background.pickFailed'));
    }
  };

  /** Re-frames the photo in place, leaving everything else about it alone. */
  const setCrop = (crop: ScreenBackgroundCrop) => {
    if (background.kind !== 'image') return;
    dispatch(editTheme({ surface: { background: { ...background, crop } } }));
  };

  const onSelect = (id: string) => {
    if (id === 'image') {
      if (background.kind !== 'image') void choosePhoto();
      return;
    }
    setBackground({ kind: id as 'none' | 'cover' });
  };

  return (
    <>
      <SettingsIconSelectCard
        // The page is already called Background; the card says what it does.
        title={t('settings.appearance.background.subtitle')}
        items={OPTIONS.map(option => ({
          id: option.id,
          icon: option.icon,
          label: t(`settings.appearance.background.${option.id}`),
        }))}
        selected={background.kind}
        onSelect={onSelect}
        showLabels
      />
      {background.kind === 'image' && (
        <BackgroundCropEditor
          uri={background.uri}
          blur={surface.backgroundBlur}
          dim={surface.backgroundDim}
          crop={background.crop}
          onChange={setCrop}
        />
      )}
      {background.kind !== 'none' && (
        <SettingsCard>
          {background.kind === 'image' && (
            <>
              <SettingsRow label={t('settings.appearance.background.changePhoto')} onPress={() => void choosePhoto()} />
              <SettingsDivider />
              <SliderRow
                label={t('settings.appearance.background.zoom')}
                value={cropOrDefault(background.crop).zoom}
                minimum={1}
                maximum={MAX_ZOOM}
                step={0.05}
                color={colors.themeColor}
                onDone={zoom => setCrop(withZoom(cropOrDefault(background.crop), zoom))}
              />
              {!isDefaultCrop(background.crop) && (
                <>
                  <SettingsDivider />
                  <SettingsRow
                    label={t('settings.appearance.background.resetCrop')}
                    onPress={() => setCrop(DEFAULT_BACKGROUND_CROP)}
                  />
                </>
              )}
              <SettingsDivider />
            </>
          )}
          {/* Two reaches: this tab bar's screens, or the whole app. There was
              a third, Home alone — one tab wearing the photo while its two
              siblings did not made the app look half-themed, and it was the
              narrowest of three choices where two already covered the intent.
              A stored `home` is carried across to `tabs` by `normalizeTheme`. */}
          {SCOPES.map(scope => (
            <React.Fragment key={scope}>
              <SettingsRow
                label={t(`settings.appearance.background.scope${scope[0].toUpperCase()}${scope.slice(1)}`)}
                selected={surface.backgroundScope === scope}
                rightText={surface.backgroundScope === scope ? t('common.selected') : undefined}
                onPress={() => dispatch(editTheme({ surface: { backgroundScope: scope } }))}
              />
              <SettingsDivider />
            </React.Fragment>
          ))}
          <SettingsDivider />
          <SliderRow
            label={t('settings.appearance.background.blur')}
            value={surface.backgroundBlur}
            maximum={60}
            step={1}
            color={colors.themeColor}
            onDone={value => dispatch(editTheme({ surface: { backgroundBlur: value } }))}
          />
          <SettingsDivider />
          <SliderRow
            label={t('settings.appearance.background.dim')}
            value={surface.backgroundDim}
            maximum={0.95}
            step={0.05}
            color={colors.themeColor}
            onDone={value => dispatch(editTheme({ surface: { backgroundDim: value } }))}
          />
        </SettingsCard>
      )}
    </>
  );
};

type SliderRowProps = {
  label: string;
  value: number;
  /** Defaults to 0. Zoom starts at 1, where the photo just fills the screen. */
  minimum?: number;
  maximum: number;
  step: number;
  color: string;
  onDone: (value: number) => void;
};

/** A labelled slider that writes on release, so a drag is one edit rather than sixty. */
const SliderRow: React.FC<SliderRowProps> = ({ label, value, minimum = 0, maximum, step, color, onDone }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.sliderRow}>
      <Text style={[styles.label, { color: colors.secondary }]}>{label}</Text>
      <Slider
        accessibilityLabel={label}
        minimumValue={minimum}
        maximumValue={maximum}
        step={step}
        value={value}
        onSlidingComplete={onDone}
        minimumTrackTintColor={color}
        maximumTrackTintColor={colors.border}
        thumbTintColor={color}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sliderRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  label: {
    ...typography.compactRowTitle,
  },
});
