import React, { forwardRef, useMemo } from 'react';
import { ArrowDownAZ, Calendar, CalendarPlus, Clock3, Flame, Star } from 'lucide-react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import SingleSelectBottomSheet, { type SingleSelectOption } from '@/components/SingleSelectBottomSheet';
import { useRatingsAvailable } from '@/features/ratings/useRatingsAvailable';

// Imported rather than restated. It was a copy of the union from
// `librarySort`, which is the kind of duplicate that stays right until the
// day an order is added to one of them.
import type { SortOrder } from '../librarySort';

interface SortBottomSheetProps { sortOrder: SortOrder; onSelect: (value: SortOrder) => void; }

const SortBottomSheet = forwardRef<BottomSheetModal, SortBottomSheetProps>(({ sortOrder, onSelect }, ref) => {
  const { t } = useTranslation();
  const ratingsAvailable = useRatingsAvailable();
  const options = useMemo<SingleSelectOption[]>(() => [
    { value: 'recent', label: t('home.sort.mostRecent'), Icon: Clock3 },
    { value: 'recentlyAdded', label: t('home.sort.recentlyAdded'), Icon: CalendarPlus },
    { value: 'title', label: t('home.sort.alphabetical'), Icon: ArrowDownAZ },
    { value: 'year', label: t('home.sort.releaseYear'), Icon: Calendar },
    { value: 'userplays', label: t('home.sort.mostPlayed'), Icon: Flame },
    // Only where the server has ratings — an order that would sort every row
    // to the same place is not an order.
    ...(ratingsAvailable
      ? [{ value: 'rating', label: t('home.sort.rating'), Icon: Star }]
      : []),
  ], [t, ratingsAvailable]);
  return (
    <SingleSelectBottomSheet
      ref={ref}
      testID="sort-sheet"
      selected={sortOrder}
      options={options}
      title={t('home.sortSheet.title')}
      onSelect={value => onSelect(value as SortOrder)}
    />
  );
});
SortBottomSheet.displayName = 'SortBottomSheet';
export default SortBottomSheet;
