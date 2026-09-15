import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

import SettingsScreen from '../components/SettingsScreen';
import SettingsCard from '../components/SettingsCard';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsDivider from '../components/SettingsDivider';
import SettingsConnectionRow from '../components/SettingsConnectionRow';
import { CONNECTION_GROUPS, useConnectionEntries } from './catalog';

/**
 * Account and self-hosted-service setup, drawn from the declared connections
 * (`catalog.ts`). Feature-source opt-ins live only in their feature settings.
 */
const ConnectionsView: React.FC = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const entries = useConnectionEntries();

  return (
    <SettingsScreen title={t('settings.sections.connections')}>
      {CONNECTION_GROUPS.map(({ group, titleKey }) => {
        const inGroup = entries.filter(entry => entry.group === group);
        if (inGroup.length === 0) return null;
        return (
          <React.Fragment key={group}>
            <SettingsCardHeader title={t(titleKey)} subtle />
            <SettingsCard>
              {inGroup.map((entry, index) => (
                <React.Fragment key={entry.id}>
                  {index > 0 && <SettingsDivider />}
                  <SettingsConnectionRow
                    label={'text' in entry.label ? entry.label.text : t(entry.label.key)}
                    summary={t(entry.summaryKey)}
                    status={entry.connected ? 'connected' : 'disconnected'}
                    statusLabel={t(entry.statusKey)}
                    onPress={() => router.push(entry.route)}
                  />
                </React.Fragment>
              ))}
            </SettingsCard>
          </React.Fragment>
        );
      })}
    </SettingsScreen>
  );
};

export default ConnectionsView;
