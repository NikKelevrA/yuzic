import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import type { ToggleItem } from '../components/SettingsToggleGroup';
import { ONLINE_SOURCES, type OnlineSourceId } from '@/providers/registry/onlineSources';
import type { RootState } from '@/state/redux/store';

type OnlineService = {
  id: OnlineSourceId;
  name: string;
  /** What leaving the device looks like for this service, in one line. */
  sends: string;
  /** Each way Yuzic uses the service, one switch apiece. */
  toggles: ToggleItem[];
};

/**
 * The declared online sources (`providers/registry/onlineSources.ts`), ready
 * to draw: one card per service, one switch per use. Each switch lives here
 * and only here; Home settings and the Search filter sheet point back to it
 * rather than keeping a copy.
 */
export function useOnlineServices(): OnlineService[] {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const values = useSelector(
    (state: RootState) => ONLINE_SOURCES.flatMap(source => source.uses.map(use => use.isOn(state))),
    shallowEqual,
  );

  return useMemo(() => {
    let index = 0;
    return ONLINE_SOURCES.map(source => ({
      id: source.id,
      name: t(source.nameKey),
      sends: t(source.sendsKey),
      toggles: source.uses.map(use => ({
        label: t(use.labelKey),
        subtext: t(use.subtextKey),
        value: values[index++] ?? false,
        onValueChange: (enabled: boolean) => { dispatch(use.set(enabled)); },
      })),
    }));
  }, [dispatch, t, values]);
}
