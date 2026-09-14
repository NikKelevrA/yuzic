import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import SettingsScreen from '../components/SettingsScreen';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsToggleGroup from '../components/SettingsToggleGroup';
import SettingsCard from '../components/SettingsCard';
import SettingsSourceList from '../components/SettingsSourceList';
import SettingsRow from '../components/SettingsRow';
import type { OnlineSourceId } from '@/providers/registry/onlineSources';
import { selectDeezerDiscoveryEnabled, selectHomeShelfVisibilityMap, selectHomeShelfLength, selectHomeShelfOrder, selectListenbrainzDiscoveryEnabled, selectSleepTimerPresets, setHomeShelfVisibility, setHomeShelfOrder, setHomeShelfLength, setSleepTimerPresets, type HomeShelfLength, type HomeShelfTier } from '@/features/settings/home/state';

const TIERS: { tier: HomeShelfTier; ids: string[] }[] = [
  { tier: 'resume', ids: ['quickPicks', 'continuePlaying', 'recentlyPlayed'] },
  { tier: 'library', ids: ['recentlyAdded', 'mostPlayed'] },
  { tier: 'server', ids: ['serverRandom', 'serverNowPlaying', 'localMix'] },
  { tier: 'listenbrainz', ids: ['lbSimilarArtistsForYou', 'lbCreatedForDailyJams', 'lbCreatedForWeeklyJams', 'lbCreatedForWeeklyExploration'] },
  { tier: 'deezer', ids: ['topArtists', 'charts'] },
];
/** Tiers an outside service fills, and which service. */
const TIER_SOURCE: Partial<Record<HomeShelfTier, OnlineSourceId>> = { listenbrainz: 'listenbrainz', deezer: 'deezer' };
const SLEEP_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const LENGTHS: HomeShelfLength[] = ['compact', 'standard', 'generous'];

const HomeSettings: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const router = useRouter();
  const visibility = useSelector(selectHomeShelfVisibilityMap);
  const deezerOn = useSelector(selectDeezerDiscoveryEnabled);
  const listenbrainzOn = useSelector(selectListenbrainzDiscoveryEnabled);
  const sourceOn: Partial<Record<OnlineSourceId, boolean>> = { deezer: deezerOn, listenbrainz: listenbrainzOn };
  const presets = useSelector(selectSleepTimerPresets);
  const length = useSelector(selectHomeShelfLength);
  const resumeOrder = useSelector(selectHomeShelfOrder('resume', TIERS[0].ids));
  const libraryOrder = useSelector(selectHomeShelfOrder('library', TIERS[1].ids));
  const serverOrder = useSelector(selectHomeShelfOrder('server', TIERS[2].ids));
  const listenbrainzOrder = useSelector(selectHomeShelfOrder('listenbrainz', TIERS[3].ids));
  const deezerOrder = useSelector(selectHomeShelfOrder('deezer', TIERS[4].ids));
  const orders: Record<HomeShelfTier, string[]> = {
    resume: resumeOrder,
    library: libraryOrder,
    server: serverOrder,
    listenbrainz: listenbrainzOrder,
    deezer: deezerOrder,
  };
  const setLength = useCallback((next: HomeShelfLength) => dispatch(setHomeShelfLength(next)), [dispatch]);

  return (
    <SettingsScreen title={t('settings.home.title')}>
      <SettingsCardHeader subtle title={t('settings.home.shelfLength')} />
      <SettingsCard>
        {LENGTHS.map(option => (
          <SettingsRow key={option} label={t(`settings.home.length.${option}`)} rightText={length === option ? t('settings.home.selected') : undefined} selected={length === option} onPress={() => setLength(option)} />
        ))}
      </SettingsCard>
      {TIERS.map(({ tier, ids }) => {
        const source = TIER_SOURCE[tier];
        // Home is local-first: a tier an outside service fills says so while
        // that service is off, and its shelves read as off with it. The switch
        // itself lives only in Online sources.
        const sourceOff = source !== undefined && !sourceOn[source];
        return (
          <React.Fragment key={tier}>
            <SettingsCardHeader subtle title={t(`settings.home.tier.${tier}`)} />
            {sourceOff && (
              <SettingsCard>
                <SettingsRow
                  testID={`home-tier-off-${tier}`}
                  label={t('settings.sources.offRow', { name: t(`settings.sources.${source}.name`) })}
                  rightText={t('settings.sources.title')}
                  status="disabled"
                  onPress={() => router.push({ pathname: '/settings/sourcesView', params: { source } })}
                />
              </SettingsCard>
            )}
            <View
              testID={`home-tier-${tier}`}
              style={sourceOff ? styles.sourceOff : undefined}
              pointerEvents={sourceOff ? 'none' : 'auto'}
              accessibilityElementsHidden={sourceOff}
              importantForAccessibility={sourceOff ? 'no-hide-descendants' : 'auto'}
            >
              <SettingsCard>
                <SettingsSourceList
                  sources={ids.map(id => ({
                    id,
                    label: t(`settings.home.shelves.${id}`),
                    enabled: visibility[id] ?? true,
                    onEnabledChange: visible => dispatch(setHomeShelfVisibility({ key: id, visible })),
                  }))}
                  sourceOrder={orders[tier]}
                  onOrderChange={order => dispatch(setHomeShelfOrder({ tier, order }))}
                  showSubtext={false}
                />
              </SettingsCard>
            </View>
          </React.Fragment>
        );
      })}
      <SettingsCardHeader subtle title={t('settings.home.sleepPresets')} />
      <SettingsToggleGroup items={SLEEP_OPTIONS.map(minutes => ({
        label: t('settings.home.minutes', { count: minutes }),
        subtext: t('settings.home.sleepPresetsSubtext'),
        value: presets.includes(minutes),
        onValueChange: enabled => {
          const next = enabled ? [...new Set([...presets, minutes])].sort((a, b) => a - b) : presets.filter(value => value !== minutes);
          if (next.length > 0) dispatch(setSleepTimerPresets(next));
        },
      }))} />
    </SettingsScreen>
  );
};

export default HomeSettings;

const styles = StyleSheet.create({
  sourceOff: { opacity: 0.4 },
});
