import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/Text';

import { spacing, typography } from '@/constants/design';
import type { ArtistScreenModel } from '@/features/artist/useArtistScreenModel';
import { useTheme } from '@/features/theme/useTheme';

/**
 * One meta row for both modes — the local/external split used to live as
 * two near-identical components (`LocalMetaRow`/`ExternalMetaRow`), each
 * re-deriving the same album/song counts the screen model now computes
 * once (`counts`).
 */
export default function ArtistMetaRow({
  isLocal,
  counts,
  virtualCatalogBrowsingEnabled,
  discographyLoading,
}: {
  isLocal: boolean;
  counts: ArtistScreenModel['counts'];
  /** Settings → Search → "Browse not-yet-downloaded results". When off,
   *  `counts.singles` is already always 0 from the model — this is a second,
   *  explicit gate rather than relying on that alone, so this row's rendering
   *  doesn't silently change if the model's off-state default ever does. */
  virtualCatalogBrowsingEnabled: boolean;
  /** `ArtistScreenModel.discographyLoading` — true only mid-fetch for an
   *  unsynced virtual-catalog artist. The page itself no longer waits on
   *  that fetch, but `counts` does momentarily read 0 while it's in
   *  flight; without this, that would flash "0 albums" before jumping to
   *  the real number a moment later. Holding the whole row back here
   *  instead reproduces what the user already saw before the page stopped
   *  blocking on this fetch — nothing, until there's a real number. */
  discographyLoading: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const metadataItems = useMemo(() => {
    const items: string[] = [];
    if (discographyLoading) return items;
    if (isLocal || counts.albums > 0) {
      items.push(`${counts.albums} ${counts.albums === 1 ? t('common.album') : t('common.albums')}`);
    }
    if (virtualCatalogBrowsingEnabled && counts.singles > 0) {
      items.push(`${counts.singles} ${counts.singles === 1 ? t('common.single') : t('common.singles')}`);
    }
    if (isLocal && counts.songs > 0) {
      items.push(`${counts.songs} ${counts.songs === 1 ? t('common.song') : t('common.songs')}`);
    }
    return items;
  }, [discographyLoading, isLocal, counts.albums, counts.singles, virtualCatalogBrowsingEnabled, counts.songs, t]);

  return (
    <View style={styles.metaRow}>
      {metadataItems.map((item, index) => (
        <React.Fragment key={`${item}-${index}`}>
          {index > 0 && <Text style={[styles.metaDot, { color: colors.subtext }]}>•</Text>}
          <Text style={[styles.metaText, { color: colors.subtext }]} numberOfLines={1}>
            {item}
          </Text>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.tight,
    flexWrap: 'wrap',
  },
  metaDot: {
    ...typography.rowSubtitle,
    marginHorizontal: spacing.tight,
  },
  metaText: {
    ...typography.rowSubtitle,
  },
});
