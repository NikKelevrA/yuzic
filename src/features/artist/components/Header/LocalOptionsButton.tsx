import React from 'react';
import { useTranslation } from 'react-i18next';
import { Ellipsis } from 'lucide-react-native';

import { DetailHeaderIconButton } from '@/components/DetailHeader';
import ArtistOptions from '@/components/options/ArtistOptions';
import { useSheetRef } from '@/components/useSheetRef';
import { iconSize } from '@/constants/design';
import type { Artist } from '@/domain/entities/Artist';
import { useTheme } from '@/features/theme/useTheme';

/** The "…" on a library artist's bar, opening the artist's options sheet. */
export default function LocalOptionsButton({ artist }: { artist: Artist }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const optionsSheetRef = useSheetRef();
  return (
    <>
      <DetailHeaderIconButton
        accessibilityLabel={t('a11y.common.moreOptions')}
        onPress={() => optionsSheetRef.current?.present()}
      >
        <Ellipsis size={iconSize.header} color={colors.secondary} />
      </DetailHeaderIconButton>
      <ArtistOptions ref={optionsSheetRef} artist={artist} hideGoToArtist />
    </>
  );
}
