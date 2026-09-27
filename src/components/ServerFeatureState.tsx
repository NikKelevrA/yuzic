import React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import EmptyState from '@/components/EmptyState';
import { useServerReachable } from '@/features/connectivity/useServerReachable';
import { serverFeatureStatus } from '@/features/connectivity/serverFeatureStatus';

/**
 * The ladder in front of a list only the server can supply.
 *
 * Radio, Podcasts and Shares each wrote these five branches out, and they had
 * drifted: Radio had no "not available on this server" state at all, so a
 * server without radio said "couldn't load" and offered a retry that could
 * never work. They are different facts and read differently — one is a thing
 * to fix, the other is a thing this server does not do.
 *
 * `children` is only reached once there is something to draw, so a screen's
 * list never has to defend itself against an empty or failed query.
 */
export default function ServerFeatureState<T>({
  query,
  icon,
  offlineIcon,
  skeleton,
  unavailableMessage,
  emptyMessage,
  emptyAction,
  children,
}: {
  query: UseQueryResult<T[]>;
  /** Drawn above every message but the offline one, which has its own. */
  icon: React.ReactNode;
  offlineIcon: React.ReactNode;
  /** What the screen shows while it waits — its own rows, at its own size. */
  skeleton: React.ReactNode;
  /** What to say when this server does not offer the feature at all. */
  unavailableMessage: string;
  emptyMessage: string;
  emptyAction?: { label: string; onPress: () => void };
  children: (rows: T[]) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const serverReachable = useServerReachable();
  const status = serverFeatureStatus({
    rows: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    serverReachable,
  });

  switch (status) {
    case 'offline':
      return (
        <EmptyState icon={offlineIcon} message={t('common.offline.serverOnlyFeature')} />
      );
    case 'loading':
      return <>{skeleton}</>;
    case 'unavailable':
      return <EmptyState icon={icon} message={unavailableMessage} />;
    case 'failed':
      return (
        <EmptyState
          icon={icon}
          message={t('common.loadFailed')}
          action={{ label: t('common.retry'), onPress: () => void query.refetch() }}
        />
      );
    case 'empty':
      return <EmptyState icon={icon} message={emptyMessage} action={emptyAction} />;
    default:
      return <>{children(query.data ?? [])}</>;
  }
}
