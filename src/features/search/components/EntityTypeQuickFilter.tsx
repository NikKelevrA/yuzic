import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import Touchable from '@/components/Touchable';
import { useTheme } from '@/features/theme/useTheme';
import { useRadius } from '@/features/theme/useRadius';
import { spacing, tinted, typography } from '@/constants/design';
import type { SearchEntityType } from '@/features/search/SearchContext';

type Props = {
  selectedEntityTypes: SearchEntityType[];
  onToggle: (entityType: SearchEntityType) => void;
};

/** Same order `SearchFiltersSheet` lists these in, so the quick row and the
 *  sheet never disagree about which comes first if a user opens both. */
const ENTITY_TYPE_ORDER: SearchEntityType[] = ['song', 'album', 'artist'];

const PILL_HEIGHT = 32;

/**
 * A quick artist/album/song toggle row shown right under the search field
 * once a MusicBrainz server of your own is configured — see
 * `useSearchScreenModel`'s `showEntityTypeQuickFilter`. Promotes the same
 * `selectedEntityTypes`/`toggleFilterEntityType` state the Filters sheet's
 * "Entity types" section already reads and writes (`searchPolicy.ts`'s
 * `SearchEntityType`), so this is a second view onto one selection, not a
 * second one — the sheet hides its own copy of the section while this row is
 * showing (`SearchFiltersSheet`'s `entityTypesShownInline` prop) so there is
 * never a moment where the two could disagree.
 *
 * A self-hosted server is the gate because this is only really useful once
 * search is precise enough to reward narrowing it — the shared public server
 * caps results tightly enough (see `PUBLIC_MAX_ARTISTS` and friends) that a
 * type filter has little to filter.
 */
const EntityTypeQuickFilter = ({ selectedEntityTypes, onToggle }: Props) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();
  const pillRadius = rad.pillFor(PILL_HEIGHT);

  return (
    <View style={styles.row} testID="search-entity-quick-filter">
      {ENTITY_TYPE_ORDER.map(entityType => {
        const checked = selectedEntityTypes.includes(entityType);
        return (
          <Touchable
            key={entityType}
            testID={`search-entity-quick-filter-${entityType}`}
            accessibilityRole="button"
            accessibilityLabel={t(`search.entityTypes.${entityType}`)}
            accessibilityState={{ selected: checked }}
            style={[
              styles.pill,
              {
                height: PILL_HEIGHT,
                borderRadius: pillRadius,
                backgroundColor: checked ? tinted(colors.themeColor, 'selected') : colors.muted,
              },
            ]}
            onPress={() => onToggle(entityType)}
          >
            <Text style={[typography.caption, { color: checked ? colors.themeColor : colors.secondary, fontWeight: checked ? '600' : '400' }]}>
              {t(`search.entityTypes.${entityType}`)}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
};

export default EntityTypeQuickFilter;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  pill: {
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
