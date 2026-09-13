import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import SettingsScreen from '../../components/SettingsScreen';
import SettingsToggleGroup from '../../components/SettingsToggleGroup';
import { selectDeezerDiscoveryEnabled, setDeezerDiscoveryEnabled } from '@/features/settings/home/state';
import {
  selectDeezerExternalEnabled,
  setDeezerExternalEnabled,
  selectSearchSourceEnabled,
  setSearchSourceEnabled,
} from '@/features/settings/search/state';

/**
 * Deezer used to have three top-level dimensions plus five sub-toggles:
 * top tracks, similar artists, album recommendations, samples, playlist
 * recommendations. Every one of those was "should Deezer fill THIS
 * discovery surface?" — the answer never varied per-surface, and shipping
 * five identical switches turned a settings page into a decision tree.
 *
 * The three that remain are the ones that mean genuinely different things:
 *   Discovery   → Deezer fills Home shelves, artist top-tracks, similar-artists.
 *   Search      → Deezer results appear in the search screen.
 *   External    → Deezer is a browsable external catalog.
 */
export default function DeezerSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const discoveryEnabled = useSelector(selectDeezerDiscoveryEnabled);
  // Writes the same unified `searchSourcesEnabled` map the Search settings
  // screen's per-source toggle writes — see Task 4.3: this used to write a
  // separate `deezerSearchEnabled` flag that `selectSearchSourceEnabled`
  // only consulted as a fallback, so once a user had touched the Search
  // screen's own toggle even once, this switch silently stopped doing
  // anything. One flag, one switch each screen agrees on.
  const searchEnabled = useSelector(selectSearchSourceEnabled('deezer'));
  const externalEnabled = useSelector(selectDeezerExternalEnabled);

  const toggleDiscovery = useCallback((v: boolean) => { dispatch(setDeezerDiscoveryEnabled(v)); }, [dispatch]);
  const toggleSearch = useCallback(
    (v: boolean) => { dispatch(setSearchSourceEnabled({ sourceId: 'deezer', enabled: v })); },
    [dispatch]
  );
  const toggleExternal = useCallback((v: boolean) => { dispatch(setDeezerExternalEnabled(v)); }, [dispatch]);

  const items = useMemo(() => [
    { label: t('settings.deezer.discovery'), subtext: t('settings.deezer.discoveryDescription'), value: discoveryEnabled, onValueChange: toggleDiscovery },
    { label: t('settings.deezer.search'), subtext: t('settings.deezer.searchDescription'), value: searchEnabled, onValueChange: toggleSearch },
    { label: t('settings.deezer.external'), subtext: t('settings.deezer.externalDescription'), value: externalEnabled, onValueChange: toggleExternal },
  ], [t, discoveryEnabled, searchEnabled, externalEnabled, toggleDiscovery, toggleSearch, toggleExternal]);

  return (
    <SettingsScreen title="Deezer">
      <SettingsToggleGroup items={items} />
    </SettingsScreen>
  );
}
