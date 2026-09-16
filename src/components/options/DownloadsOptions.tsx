import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import { RefreshCw, Settings2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { EntityOptionsSheet } from '@/features/entity-actions/EntityOptionsSheet';
import type { ResolvedAction } from '@/features/entity-actions/types';
import { useSheetRef } from '@/components/useSheetRef';
import { useTheme } from '@/features/theme/useTheme';
import { iconSize } from '@/constants/design';
import type { CoverSource } from '@/domain/entities/Cover';

/** A queue is not a thing with artwork, and the sheet says so the way every
 *  list-level sheet does. */
const NO_COVER: CoverSource = { kind: 'none' };

const sz = iconSize.loader;

/** What the screen can do to this sheet: open it. */
export type DownloadsOptionsHandle = {
  present: () => void;
};

type Props = {
  title: string;
  subtitle?: string;
  onRefresh: () => void;
  onManage: () => void;
};

/**
 * The Downloads screen's own "…": what applies to the list of transfers
 * rather than to one of them.
 *
 * Refresh is a real read rather than a spinner: the shared poller runs on a
 * 30-second interval, which is right for a background count and far too long
 * to sit watching after asking a downloader for something.
 *
 * **Opened imperatively, and mounted for as long as the screen is** — the
 * same treatment the Wants pickers needed, for the same two reasons. Opening
 * by flipping a boolean silently did nothing whenever that boolean was
 * already true, which it is for as long as a dismissing sheet takes to
 * animate out; and this screen re-renders on every queue poll, so the modal
 * has to be memoised with stable props or it re-measures mid-dismiss and
 * cancels its own closing.
 */
const DownloadsListOptions = forwardRef<DownloadsOptionsHandle, Props>(
  function DownloadsListOptions({ title, subtitle, onRefresh, onManage }, ref) {
    const { t } = useTranslation();
    const { colors } = useTheme();
    const sheetRef = useSheetRef();
    const snapPoints = useMemo(() => ['30%'], []);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
    }), [sheetRef]);

    const run = (action: () => void) => () => { sheetRef.current?.dismiss(); action(); };

    const actions: ResolvedAction[] = [
      {
        id: 'refresh',
        label: t('downloads.refresh'),
        icon: <RefreshCw size={sz} color={colors.secondary} />,
        onPress: run(onRefresh),
        testID: 'downloads-option-refresh',
      },
      {
        id: 'manage',
        label: t('downloads.manageDownloaders'),
        icon: <Settings2 size={sz} color={colors.secondary} />,
        onPress: run(onManage),
        testID: 'downloads-option-manage',
      },
    ];

    return (
      <EntityOptionsSheet
        ref={sheetRef}
        testID="downloads-list-options-sheet"
        snapPoints={snapPoints}
        header={{ cover: NO_COVER, title, subtitle }}
        actions={actions}
      />
    );
  }
);

export default React.memo(DownloadsListOptions);
