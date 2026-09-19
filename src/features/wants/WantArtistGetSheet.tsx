import React, { useEffect } from 'react';

import { useSheetRef } from '@/components/useSheetRef';
import type { Want } from '@/state/redux/slices/wantsSlice';
import ArtistGetSheet from './ArtistGetSheet';

/**
 * The artist review, opened for a want.
 *
 * The counterpart of `WantGetSheet`, and the same shape of thing: all it adds
 * is the translation from a saved want back into the artist that sheet speaks
 * in. A want carries the artist's name in `artist`, with `title` as the older
 * spelling — `arrival` and `jobStatus` read it the same way round, so a want
 * saved before that still resolves.
 */
export default function WantArtistGetSheet({ want, onClose }: { want: Want; onClose: () => void }) {
  const sheetRef = useSheetRef();

  useEffect(() => { sheetRef.current?.present(); }, [sheetRef]);

  return (
    <ArtistGetSheet
      artist={{
        localId: want.localId,
        name: want.artist || want.title,
        mbid: want.externalIds?.mbid,
        cover: want.cover ?? { kind: 'none' },
      }}
      sheetRef={sheetRef}
      onDismiss={onClose}
    />
  );
}
