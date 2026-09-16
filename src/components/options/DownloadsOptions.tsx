import React, { useEffect, useMemo } from 'react';
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

/**
 * The Downloads screen's own "…": what applies to the list of transfers
 * rather than to one of them.
 *
 * Downloads was the last list screen with no list-level options at all —
 * Radio has had them, and every detail screen puts what applies to the whole
 * screen behind a "…" on the bar. The two things that apply here are reading
 * the queues again and going to where downloaders are set up.
 *
 * Refresh is a real read rather than a spinner: the shared poller runs on a
 * 30-second interval, which is right for a background count and far too long
 * to sit watching after asking a downloader for something.
 */
function DownloadsListOptionsImpl({
  title,
  subtitle,
  onClose,
  onRefresh,
  onManage,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onRefresh: () => void;
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const sheetRef = useSheetRef();
  const snapPoints = useMemo(() => ['30%'], []);

  useEffect(() => { sheetRef.current?.present(); }, [sheetRef]);

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
      onChange={index => { if (index === -1) onClose(); }}
      header={{ cover: NO_COVER, title, subtitle }}
      actions={actions}
    />
  );
}

/**
 * Memoised, and given stable callbacks by the screen.
 *
 * Downloads reads the queue it is showing, so it re-renders on every poll —
 * and a live `BottomSheetModal` re-rendered mid-dismiss re-measures its
 * content and cancels the dismissal, which is a sheet that will not close.
 * That is the bug Wants had; this is the same shape, so it gets the same
 * treatment rather than waiting to be reported.
 */
export const DownloadsListOptions = React.memo(DownloadsListOptionsImpl);
