import React, { useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { EntityOptionsSheet } from '@/features/entity-actions/EntityOptionsSheet';
import type { ResolvedAction } from '@/features/entity-actions/types';
import { useSheetRef } from '@/components/useSheetRef';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize, statusColor } from '@/constants/design';
import type { Want } from '@/state/redux/slices/wantsSlice';

const sz = iconSize.loader;

/**
 * A saved want's options: look for it, or drop it.
 *
 * Search is here rather than only in the empty state because a want that is
 * still unresolved is exactly the one you would go looking for again, and the
 * row's own "×" gave the destructive half of that pair the only affordance.
 */
export function WantOptions({
  want,
  onClose,
  onSearch,
  onRemove,
}: {
  want: Want;
  onClose: () => void;
  onSearch: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sheetRef = useSheetRef();
  const snapPoints = useMemo(() => ['30%'], []);

  useEffect(() => { sheetRef.current?.present(); }, [sheetRef]);

  const run = (action: () => void) => () => { sheetRef.current?.dismiss(); action(); };

  const actions: ResolvedAction[] = [
    {
      id: 'search',
      label: t('wants.searchAction'),
      icon: <Search size={sz} color={colors.secondary} />,
      onPress: run(onSearch),
      testID: 'want-option-search',
    },
    {
      id: 'remove',
      label: t('wants.remove'),
      icon: <X size={sz} color={statusColor.destructive} />,
      labelColor: statusColor.destructive,
      onPress: run(onRemove),
      testID: 'want-option-remove',
    },
  ];

  return (
    <EntityOptionsSheet
      ref={sheetRef}
      testID="want-options-sheet"
      snapPoints={snapPoints}
      onChange={index => { if (index === -1) onClose(); }}
      header={{ cover: { kind: 'none' }, title: want.title, subtitle: want.artist }}
      actions={actions}
    />
  );
}
