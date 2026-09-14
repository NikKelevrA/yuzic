import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useRouter } from 'expo-router';
import SettingsScreen from '../components/SettingsScreen';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsToggleGroup from '../components/SettingsToggleGroup';
import SettingsCard from '../components/SettingsCard';
import SettingsSourceList from '../components/SettingsSourceList';
import SettingsRow from '../components/SettingsRow';
import SourceUseList from '../sources/SourceUseList';
import { selectSourceUses } from '../sources/state';
import { HOME_SOURCE_TIERS } from '@/providers/registry/homeDiscovery';
import type { SourceId } from '@/providers/registry/sources';
import type { RootState } from '@/state/redux/store';
import { resolveHomeShelfOrder, selectHomeShelfOrders, selectHomeShelfVisibilityMap, selectHomeShelfLength, selectSleepTimerPresets, setHomeShelfVisibility, setHomeShelfOrder, setHomeShelfLength, setSleepTimerPresets, type HomeShelfLength, type HomeShelfTier } from '@/features/settings/home/state';

type Tier = {
  tier: HomeShelfTier;
  ids: readonly string[];
  /** The outside source that fills this tier, if one does. */
  source?: SourceId;
};

/** Your own tiers, then one per outside source, as the registry declares them. */
const TIERS: Tier[] = [
  { tier: 'resume', ids: ['quickPicks', 'continuePlaying', 'recentlyPlayed'] },
  { tier: 'library', ids: ['recentlyAdded', 'mostPlayed'] },
  { tier: 'server', ids: ['serverRandom', 'serverNowPlaying', 'localMix'] },
  ...HOME_SOURCE_TIERS.map(tier => ({ tier: tier.source, ids: tier.shelves, source: tier.source })),
];
const SLEEP_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const LENGTHS: HomeShelfLength[] = ['compact', 'standard', 'generous'];

/** For each outside tier that needs an account for some shelves: whether one is connected. */
const selectAccountsConnected = (state: RootState): boolean[] =>
  HOME_SOURCE_TIERS.map(tier => (tier.account ? tier.account.isConnected(state) : true));

const HomeSettings: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const router = useRouter();
  const visibility = useSelector(selectHomeShelfVisibilityMap);
  const sourceUses = useSelector(selectSourceUses);
  const accountsConnected = useSelector(selectAccountsConnected, shallowEqual);
  const presets = useSelector(selectSleepTimerPresets);
  const length = useSelector(selectHomeShelfLength);
  const orders = useSelector(selectHomeShelfOrders);
  const setLength = useCallback((next: HomeShelfLength) => dispatch(setHomeShelfLength(next)), [dispatch]);

  return (
    <SettingsScreen title={t('settings.home.title')}>
      <SettingsCardHeader subtle title={t('settings.home.shelfLength')} />
      <SettingsCard>
        {LENGTHS.map(option => (
          <SettingsRow key={option} label={t(`settings.home.length.${option}`)} rightText={length === option ? t('settings.home.selected') : undefined} selected={length === option} onPress={() => setLength(option)} />
        ))}
      </SettingsCard>
      {TIERS.map(({ tier, ids, source }) => {
        const sourceTier = source ? HOME_SOURCE_TIERS.find(entry => entry.source === source) : undefined;
        const account = sourceTier?.account;
        // Home is local-first: a tier an outside source fills has that
        // source's switch at its head, and its shelves read as off with it.
        const sourceOff = source !== undefined && !sourceUses?.[`${source}.homeShelves`];
        // Some shelves need an account as well as the switch. Said here,
        // beside them, rather than leaving them silently empty.
        const connected = sourceTier ? accountsConnected[HOME_SOURCE_TIERS.indexOf(sourceTier)] : true;
        const needsAccount = Boolean(account) && !sourceOff && !connected;
        return (
          <React.Fragment key={tier}>
            <SettingsCardHeader subtle title={t(`settings.home.tier.${tier}`)} />
            {source && <SourceUseList purpose="homeShelves" source={source} />}
            {needsAccount && account && (
              <SettingsCard>
                <SettingsRow
                  testID={`home-${source}-connect`}
                  label={t('settings.home.connectListenBrainz')}
                  onPress={() => router.push(account.connectRoute)}
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
                    enabled: (visibility[id] ?? true) && !(needsAccount && account?.shelves.includes(id)),
                    onEnabledChange: visible => dispatch(setHomeShelfVisibility({ key: id, visible })),
                  }))}
                  sourceOrder={resolveHomeShelfOrder(orders?.[tier], [...ids])}
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
