import React from 'react';
import { CheckCircle, ArrowDownCircle } from 'lucide-react-native';
import { iconSize } from '@/constants/design';

/**
 * The download row's icon/label/dim state is identical across all four
 * kinds — CheckCircle once downloaded, a spinner while in flight, the same
 * three-way label switch. What differs per kind is *what* gets downloaded
 * (a track, a collection's songs, or — for artists — every album), which
 * stays in each kind's own `invoke`.
 */
export function downloadRowLabel(opts: {
  t: (key: string) => string;
  isDownloaded: boolean;
  isDownloading: boolean;
  downloadingKey: string;
  downloadedKey: string;
  downloadKey: string;
}): string {
  if (opts.isDownloading) return opts.t(opts.downloadingKey);
  if (opts.isDownloaded) return opts.t(opts.downloadedKey);
  return opts.t(opts.downloadKey);
}

export function downloadRowIcon(opts: { isDownloaded: boolean; subtextColor: string; secondaryColor: string }): React.ReactNode {
  return opts.isDownloaded
    ? React.createElement(CheckCircle, { size: iconSize.loader, color: opts.subtextColor })
    : React.createElement(ArrowDownCircle, { size: iconSize.loader, color: opts.secondaryColor });
}
