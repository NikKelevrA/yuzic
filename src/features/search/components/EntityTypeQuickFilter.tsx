import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, tinted, typography } from '@/constants/design';
import Touchable from '@/components/Touchable';
import { useTheme } from '@/features/theme/useTheme';
import { useRadius } from '@/features/theme/useRadius';
import type { SearchEntityType } from '@/features/search/SearchContext';

type Props = {
  selectedEntityTypes: SearchEntityType[];
  onToggle: (entityType: SearchEntityType) => void;
};

const ENTITY_TYPE_ORDER: SearchEntityType[] = ['artist', 'song', 'album'];

/**
 * Self-hosted-MusicBrainz-only: a row of quick filters under the search bar,
 * all off by default (see `useSearchScreenModel`'s `selectedEntityTypes`
 * initial state).
 *
 * Turning one on doesn't ask the app to filter or rank anything — it adds
 * that entity kind to what's asked for in the "Other sources" request (see
 * `searchExternalLeg`'s `kinds`), and MusicBrainz answers with just that
 * kind. With nothing picked, nothing is asked of MusicBrainz at all: no
 * request goes out on every keystroke until a type is deliberately chosen.
 * Sits alongside, not instead of, the Filters sheet's own album/artist
 * checkboxes — same underlying selection, just promoted to where it's one
 * tap away.
 */
export default function EntityTypeQuickFilter({ selectedEntityTypes, onToggle }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();

  return (
    <View style={styles.row} testID="entity-type-quick-filter">
      {ENTITY_TYPE_ORDER.map(entityType => {
        const selected = selectedEntityTypes.includes(entityType);
        return (
          <Touchable
            key={entityType}
            testID={`entity-type-quick-filter-${entityType}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t(`search.entityTypes.${entityType}`)}
            onPress={() => onToggle(entityType)}
            style={[
              styles.pill,
              {
                backgroundColor: selected ? tinted(colors.themeColor, 'selected') : colors.muted,
                // A toggle control, same shape language as the filters
                // button beside the search bar — `rad.md`, not `rad.pill`
                // (that token is for a fixed-identity badge, not a control).
                borderRadius: rad.md,
              },
            ]}
          >
            <Text style={[styles.pillLabel, { color: selected ? colors.themeColor : colors.secondary }]}>
              {t(`search.entityTypes.${entityType}`)}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pillLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
});
