import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import SettingsScreen from '../../components/SettingsScreen';
import SettingsToggleGroup from '../../components/SettingsToggleGroup';
import { selectMusicbrainzExternalEnabled, setMusicbrainzExternalEnabled } from '@/features/settings/search/state';

export default function MusicBrainzSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const externalEnabled = useSelector(selectMusicbrainzExternalEnabled);

  return (
    <SettingsScreen title="MusicBrainz">
      <SettingsToggleGroup
        items={[
          {
            label: t('settings.musicbrainz.external'),
            subtext: t('settings.musicbrainz.externalDescription'),
            value: externalEnabled,
            onValueChange: v => { dispatch(setMusicbrainzExternalEnabled(v)); },
          },
        ]}
      />
    </SettingsScreen>
  );
}
