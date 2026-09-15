import React from 'react';
import type { ErrorBoundaryProps } from 'expo-router';

import ScreenError from '@/components/ScreenError';
import { useTheme } from '@/features/theme/useTheme';

/**
 * The `ErrorBoundary` a layout exports, so a crash stays inside that part of
 * the app.
 *
 * The app had one boundary, at the root: a crash on any screen replaced the
 * whole app — tabs, player and all — with a restart button. Exported from a
 * tab's stack, it replaces only that stack; the tab bar, the playing bar and
 * the other tabs keep working, and Try again re-renders the stack in place.
 */
export default function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { colors } = useTheme();
  return (
    <ScreenError
      error={error}
      retry={retry}
      palette={{
        background: colors.background,
        text: colors.secondary,
        subtext: colors.subtext,
        surface: colors.card,
        border: colors.border,
      }}
    />
  );
}
