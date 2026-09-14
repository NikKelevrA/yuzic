import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { SOURCES, SOURCE_SCREENS, SOURCE_USES, type SourceId } from '@/providers/registry/sources';
import { selectSourceUses } from './state';

/**
 * What a source screen's row in Settings says beside its title: the sources
 * switched on there, in the order they are tried, or "Off" — so what is on
 * shows without opening anything.
 */
export function useSourceScreenSummary(screen: keyof typeof SOURCE_SCREENS): string {
  const { t } = useTranslation();
  const uses = useSelector(selectSourceUses);
  const purposes = SOURCE_SCREENS[screen];

  const sources: SourceId[] = [];
  for (const entry of SOURCE_USES) {
    if (purposes.includes(entry.purpose) && uses?.[entry.id] && !sources.includes(entry.source)) {
      sources.push(entry.source);
    }
  }
  return sources.length > 0
    ? sources.map(source => t(SOURCES[source].nameKey)).join(', ')
    : t('settings.sources.off');
}
