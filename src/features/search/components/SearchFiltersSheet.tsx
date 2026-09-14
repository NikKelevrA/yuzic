import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Switch, Text } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { useTheme } from '@/features/theme/useTheme';
import { renderBackdrop } from '@/components/BottomSheetBackdrop';
import {
  OptionSheetDivider,
  OptionSheetRow,
  OptionSheetSectionLabel,
  optionSheetStyles,
  useOptionSheetBackground,
} from '@/components/options/OptionSheetPrimitives';
import { getSourceMeta, type SourceId } from '@/features/sources/registry';
import { SEARCH_SOURCE_IDS, setSearchSourceEnabled } from '@/features/settings/search/state';
import { iconSize, onDark, spacing, typography } from '@/constants/design';
import type { SearchEntityType } from '@/features/search/SearchContext';
import type { SearchResultScope } from '@/features/search/searchLegs';

type Props = {
  resultScope: SearchResultScope;
  onChangeScope: (scope: SearchResultScope) => void;
  /** Sources enabled for search at all. The rest are offered below them with
   *  a switch, so turning one on doesn't mean leaving the search. */
  availableSourceIds: SourceId[];
  selectedSourceIds: string[];
  onToggleSource: (sourceId: SourceId) => void;
  selectedEntityTypes: SearchEntityType[];
  onToggleEntityType: (entityType: SearchEntityType) => void;
};

const SCOPE_ORDER: SearchResultScope[] = ['library', 'other'];
const ENTITY_TYPE_ORDER: SearchEntityType[] = ['album', 'artist'];

/**
 * The Search filter sheet. It owns the whole scope choice now — "Your Library"
 * vs "Other sources" is the first section here rather than a segmented control
 * on the screen, so the search field gets the full width and the one control
 * to its right holds every search decision. Picking "Other sources" reveals the
 * source and entity-type filters beneath; "Your Library" hides them because
 * they don't apply to a local search.
 *
 * A source that is on is a check: in play for *this* search or not. A source
 * that is off is a switch, saying what turning it on sends — the same setting
 * as Settings › Online sources, offered where the decision comes up instead of
 * as a pointer to go and find it.
 */
const SearchFiltersSheet = forwardRef<BottomSheetModal, Props>(
  ({ resultScope, onChangeScope, availableSourceIds, selectedSourceIds, onToggleSource, selectedEntityTypes, onToggleEntityType }, ref) => {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const dispatch = useDispatch();
    const sheetBg = useOptionSheetBackground();

    const entityTypeLabel = (entityType: SearchEntityType) => t(`search.entityTypes.${entityType}`);
    const offSourceIds = SEARCH_SOURCE_IDS.filter(id => !availableSourceIds.includes(id));
    const enableSource = (sourceId: SourceId) => {
      dispatch(setSearchSourceEnabled({ sourceId, enabled: true }));
      // Turned on from here, it's wanted for this search too.
      if (!selectedSourceIds.includes(sourceId)) onToggleSource(sourceId);
    };

    const snapPoints = useMemo(() => ['50%'], []);
    const isOther = resultScope === 'other';

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
        backgroundStyle={[optionSheetStyles.sheetBackground, sheetBg]}
      >
        <BottomSheetScrollView style={sheetBg} contentContainerStyle={optionSheetStyles.sheetContent}>
          <Text style={[styles.title, { color: colors.secondary }]}>
            {t('search.filters.title')}
          </Text>

          <OptionSheetSectionLabel label={t('search.filters.scope')} />
          {SCOPE_ORDER.map(scope => {
            const checked = resultScope === scope;
            return (
              <OptionSheetRow
                key={scope}
                testID={`search-filters-scope-${scope}`}
                label={t(`search.scope.${scope}`)}
                onPress={() => onChangeScope(scope)}
                trailing={checked ? <Check size={iconSize.secondary} color={colors.themeColor} /> : undefined}
              />
            );
          })}

          {isOther && (
            <>
              <OptionSheetDivider />

              <OptionSheetSectionLabel label={t('search.filters.sources')} />
              {availableSourceIds.map(sourceId => {
                const meta = getSourceMeta(sourceId);
                const checked = selectedSourceIds.includes(sourceId);
                return (
                  <OptionSheetRow
                    key={sourceId}
                    testID={`search-filters-source-${sourceId}`}
                    label={meta?.label ?? sourceId}
                    onPress={() => onToggleSource(sourceId)}
                    trailing={checked ? <Check size={iconSize.secondary} color={colors.themeColor} /> : undefined}
                  />
                );
              })}
              {offSourceIds.map(sourceId => {
                const label = getSourceMeta(sourceId)?.label ?? sourceId;
                return (
                  <OptionSheetRow
                    key={sourceId}
                    testID={`search-filters-enable-${sourceId}`}
                    label={label}
                    description={t('search.filters.sendsQuery', { name: label })}
                    onPress={() => enableSource(sourceId)}
                    trailing={(
                      <Switch
                        testID={`search-filters-enable-switch-${sourceId}`}
                        value={false}
                        onValueChange={on => { if (on) enableSource(sourceId); }}
                        trackColor={{ true: colors.themeColor }}
                        thumbColor={onDark.text}
                      />
                    )}
                  />
                );
              })}
              {offSourceIds.length > 0 && (
                <Text style={[styles.note, { color: colors.subtext }]}>
                  {t('search.filters.alsoInSettings')}
                </Text>
              )}

              <OptionSheetDivider />

              <OptionSheetSectionLabel label={t('search.filters.entityTypes')} />
              {ENTITY_TYPE_ORDER.map(entityType => {
                const checked = selectedEntityTypes.includes(entityType);
                return (
                  <OptionSheetRow
                    key={entityType}
                    testID={`search-filters-entity-${entityType}`}
                    label={entityTypeLabel(entityType)}
                    onPress={() => onToggleEntityType(entityType)}
                    trailing={checked ? <Check size={iconSize.secondary} color={colors.themeColor} /> : undefined}
                  />
                );
              })}
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);

SearchFiltersSheet.displayName = 'SearchFiltersSheet';

export default SearchFiltersSheet;

const styles = StyleSheet.create({
  title: {
    ...typography.rowTitle,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  note: {
    ...typography.caption,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
});
