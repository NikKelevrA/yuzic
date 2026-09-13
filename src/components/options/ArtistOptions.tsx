import React, { forwardRef, useMemo, useState } from 'react';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Artist } from '@/domain/entities/Artist';
import { OptionSheetInfoRow, OptionSheetSectionLabel, OptionSheetDivider } from './OptionSheetPrimitives';
import { EntityOptionsSheet } from '@/features/entity-actions/EntityOptionsSheet';
import { dismissSheetRef } from '@/features/entity-actions/shared/sheetRef';
import { useArtistOptionsActions } from '@/features/entity-actions/hooks/useArtistActions';

export type ArtistOptionsProps = {
  artist: Artist | null;
  /** Hide "Go to Artist" when already on the artist screen */
  hideGoToArtist?: boolean;
};

/**
 * `artist` may be null while the caller resolves it — one component
 * throughout (not a separate loading component) so the same
 * `BottomSheetModal` instance carries across that transition; see
 * `EntityOptionsSheet`'s `header: null` doc.
 */
const ArtistOptions = forwardRef<BottomSheetModal, ArtistOptionsProps>(
  ({ artist, hideGoToArtist }, ref) => {
    const { t } = useTranslation();
    const snapPoints = useMemo(() => ['55%', '90%'], []);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const close = () => dismissSheetRef(ref);

    const { actions, artistAlbums, playCount } = useArtistOptionsActions(artist, {
      hideGoToArtist: !!hideGoToArtist, isSheetOpen, close,
    });

    return (
      <EntityOptionsSheet
        ref={ref}
        testID="artist-options-sheet"
        snapPoints={snapPoints}
        onChange={index => setIsSheetOpen(index >= 0)}
        header={artist ? { cover: artist.cover, title: artist.name, subtitle: t('artistOptions.artistLabel'), titleLines: 2 } : null}
        actions={actions}
        infoSection={artist && (
          <>
            <OptionSheetDivider />
            <OptionSheetSectionLabel label={t('artistOptions.sections.info')} />
            <OptionSheetInfoRow label={t('artistOptions.info.albums')} value={artistAlbums.length} />
            <OptionSheetInfoRow label={t('artistOptions.info.plays')} value={playCount} />
          </>
        )}
      />
    );
  }
);

ArtistOptions.displayName = 'ArtistOptions';

export default ArtistOptions;
