import { statusColor } from '@/constants/design';

export const DOWNLOAD_QUALITY_OPTIONS = [
  { key: 'low' as const, labelKey: 'settings.library.downloadQuality.options.low' },
  { key: 'medium' as const, labelKey: 'settings.library.downloadQuality.options.medium' },
  { key: 'high' as const, labelKey: 'settings.library.downloadQuality.options.high' },
  { key: 'original' as const, labelKey: 'settings.library.downloadQuality.options.original' },
] as const;

// iOS system-gray for the "off" states so the connected/enabled dots and
// the disconnected/disabled dots read as one language across settings.
const IOS_SYSTEM_GRAY = '#8E8E93';

export const SETTINGS_STATUS_COLORS = {
  connected: statusColor.success,
  enabled: statusColor.success,
  disconnected: IOS_SYSTEM_GRAY,
  disabled: IOS_SYSTEM_GRAY,
} as const;
