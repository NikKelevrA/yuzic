import React from 'react';
import { Heart, CloudDownload, ChevronRight, Link } from 'lucide-react-native';
import type { Album } from '@/domain/entities/Album';
import { iconSize, spacing, statusColor } from '@/constants/design';
import type { ActionDef, BaseActionContext } from '../types';
import type { ExternalAlbumStatus } from '@/features/downloaders/useExternalAlbumStatus';
import { promptConnectDownloader } from '@/features/downloaders/connectDownloaderPrompt';

export interface AlbumExternalActionContext extends BaseActionContext {
  kind: 'album';
  origin: 'external';
  album: Album;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string; muted: string; placeholder: string };
  status: ExternalAlbumStatus;
  isWanted: boolean;
  canDownload: boolean;
  handlers: {
    toggleWant: () => void;
    openGet: () => void;
  };
}

type Ctx = AlbumExternalActionContext;
const sz = iconSize.loader;

/**
 * Mirrors the original `ExternalAlbumOptionsSheet`'s three-way branch on
 * `status.kind`: "in library" and "downloading" each render a single inert
 * informational row instead of the Want/Get rows, rather than adding a
 * fourth row alongside them. Modeled here as three mutually-exclusive rows
 * gated on `status.kind`, same as the original if/else-if/else.
 */
export const albumExternalActions: ActionDef<Ctx>[] = [
  {
    id: 'inLibrary',
    label: ctx => ctx.t('externalAlbum.menu.inLibrary'),
    icon: () => React.createElement(Link, { size: sz, color: statusColor.success }),
    visible: ctx => ctx.status.kind === 'in_library',
    enabled: () => false,
    invoke: () => {},
  },
  {
    id: 'downloading',
    label: ctx => ctx.t('externalAlbum.menu.downloading', {
      progress: ctx.status.kind === 'downloading' ? ctx.status.progress : undefined,
    }),
    icon: () => null,
    visible: ctx => ctx.status.kind === 'downloading',
    enabled: () => false,
    invoke: () => {},
  },
  {
    id: 'want',
    label: ctx => ctx.t(ctx.isWanted ? 'externalAlbum.menu.wanted' : 'externalAlbum.menu.want'),
    icon: ctx => React.createElement(Heart, {
      size: sz,
      color: ctx.isWanted ? statusColor.success : ctx.colors.secondary,
      fill: ctx.isWanted ? statusColor.success : 'none',
    }),
    visible: ctx => ctx.status.kind === 'none' && !!ctx.album.localId,
    invoke: ctx => ctx.handlers.toggleWant(),
  },
  {
    id: 'get',
    label: ctx => ctx.t('externalAlbum.menu.get'),
    icon: ctx => React.createElement(CloudDownload, { size: sz, color: ctx.colors.secondary }),
    trailing: ctx => React.createElement(ChevronRight, { size: iconSize.inline, color: ctx.colors.placeholder, style: { marginLeft: spacing.xs } }),
    visible: ctx => ctx.status.kind === 'none' && ctx.canDownload,
    invoke: ctx => ctx.handlers.openGet(),
  },
  {
    id: 'noServiceConnected',
    label: ctx => ctx.t('externalAlbum.menu.noServiceConnected'),
    icon: ctx => React.createElement(CloudDownload, { size: sz, color: ctx.colors.muted }),
    labelColor: ctx => ctx.colors.muted,
    visible: ctx => ctx.status.kind === 'none' && !ctx.canDownload,
    invoke: () => promptConnectDownloader('album'),
  },
];
