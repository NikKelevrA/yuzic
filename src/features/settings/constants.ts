import { fixedColor, statusColor } from '@/constants/design';

export const DOWNLOAD_QUALITY_OPTIONS = [
  { key: 'low' as const, labelKey: 'settings.library.downloadQuality.options.low' },
  { key: 'medium' as const, labelKey: 'settings.library.downloadQuality.options.medium' },
  { key: 'high' as const, labelKey: 'settings.library.downloadQuality.options.high' },
  { key: 'original' as const, labelKey: 'settings.library.downloadQuality.options.original' },
] as const;

// The "off" half of every status dot, so disconnected and disabled read as
// one language across settings. `fixedColor.systemGray` is where it lives.
const IOS_SYSTEM_GRAY = fixedColor.systemGray;

export const SETTINGS_STATUS_COLORS = {
  connected: statusColor.success,
  enabled: statusColor.success,
  disconnected: IOS_SYSTEM_GRAY,
  disabled: IOS_SYSTEM_GRAY,
} as const;
