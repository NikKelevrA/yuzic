import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import SettingsScreen from '../components/SettingsScreen';
import SettingsCard from '../components/SettingsCard';
import SettingsCardHeader from '../components/SettingsCardHeader';
import SettingsSelectCard from '../components/SettingsSelectCard';
import SettingsToggleRow from '../components/SettingsToggleRow';
import SourceUseList from '../sources/SourceUseList';
import { selectVirtualCatalogBrowsingEnabled, setVirtualCatalogBrowsingEnabled } from '../sources/state';
import { selectSearchScope, setSearchScope, type SearchScope } from './state';

const SCOPES: SearchScope[] = ['server', 'client'];

/**
 * Everything about where a search looks: your library through your server's
 * search or on this device, and which outside sources are searched as well.
 * Where a search runs used to sit in Server settings, where nobody looking
 * for search would think to find it.
 */
export default function SearchSettings() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const scope = useSelector(selectSearchScope);
  const virtualCatalogBrowsingEnabled = useSelector(selectVirtualCatalogBrowsingEnabled);

  return (
    <SettingsScreen title={t('settings.search.title')}>
      <SettingsSelectCard
        title={t('settings.search.scopeTitle')}
        items={SCOPES.map(key => ({ key, label: t(`settings.search.scope.${key}`) }))}
        isSelected={key => scope === key}
        onSelect={key => dispatch(setSearchScope(key as SearchScope))}
      />
      <SettingsCard>
        <SettingsToggleRow
          testID="virtual-catalog-browsing"
          label={t('settings.search.virtualCatalog.title')}
          subtext={t('settings.search.virtualCatalog.subtext')}
          value={virtualCatalogBrowsingEnabled}
          onValueChange={enabled => dispatch(setVirtualCatalogBrowsingEnabled(enabled))}
        />
      </SettingsCard>
      <SettingsCardHeader subtle title={t('settings.search.otherSources')} />
      <SourceUseList purpose="search" />
    </SettingsScreen>
  );
}
