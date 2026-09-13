import React from 'react';
import { ListEnd, Play, Shuffle, List, Trash2, Pencil, Share2 } from 'lucide-react-native';
import type { Playlist } from '@/domain/entities/Playlist';
import { iconSize, statusColor } from '@/constants/design';
import type { ActionDef, BaseActionContext } from '../types';
import { downloadRowIcon, downloadRowLabel } from '../shared/downloadActions';

export interface PlaylistActionContext extends BaseActionContext {
  kind: 'playlist';
  origin: 'library';
  playlist: Playlist;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string; subtext: string };
  playbackDisabled: boolean;
  songsLoading: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isSharing: boolean;
  canShare: boolean;
  isFavorites: boolean;
  isDeleting: boolean;
  hideGoToPlaylist: boolean;
  handlers: {
    play: () => void;
    shuffle: () => void;
    addToQueue: () => void;
    shuffleToQueue: () => void;
    goToPlaylist: () => void;
    download: () => void;
    share: () => void;
    rename: () => void;
    delete: () => void;
  };
}

type Ctx = PlaylistActionContext;
const sz = iconSize.loader;

export const playlistActions: ActionDef<Ctx>[] = [
  {
    id: 'play',
    label: ctx => ctx.t('playlistOptions.actions.play'),
    icon: ctx => React.createElement(Play, { size: sz, color: ctx.colors.secondary, fill: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    loading: ctx => ctx.songsLoading,
    invoke: ctx => ctx.handlers.play(),
  },
  {
    id: 'shuffle',
    label: ctx => ctx.t('playlistOptions.actions.shuffle'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffle(),
  },
  {
    id: 'addToQueue',
    label: ctx => ctx.t('playlistOptions.actions.addToQueue'),
    icon: ctx => React.createElement(ListEnd, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.addToQueue(),
  },
  {
    id: 'shuffleToQueue',
    label: ctx => ctx.t('playlistOptions.actions.shuffleToQueue'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffleToQueue(),
  },
  {
    id: 'goToPlaylist',
    label: ctx => ctx.t('playlistOptions.actions.goToPlaylist'),
    icon: ctx => React.createElement(List, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => !ctx.hideGoToPlaylist,
    invoke: ctx => ctx.handlers.goToPlaylist(),
  },
  {
    id: 'download',
    label: ctx => downloadRowLabel({
      t: ctx.t, isDownloaded: ctx.isDownloaded, isDownloading: ctx.isDownloading,
      downloadingKey: 'playlistOptions.actions.downloading', downloadedKey: 'playlistOptions.actions.downloaded', downloadKey: 'playlistOptions.actions.download',
    }),
    icon: ctx => downloadRowIcon({ isDownloaded: ctx.isDownloaded, subtextColor: ctx.colors.subtext, secondaryColor: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !(ctx.isDownloaded || ctx.isDownloading),
    loading: ctx => ctx.isDownloading,
    dimLabel: ctx => ctx.isDownloaded || ctx.isDownloading,
    invoke: ctx => ctx.handlers.download(),
  },
  {
    id: 'share',
    label: ctx => ctx.t('playlistOptions.actions.share'),
    icon: ctx => React.createElement(Share2, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.canShare,
    enabled: ctx => !ctx.isSharing,
    loading: ctx => ctx.isSharing,
    invoke: ctx => ctx.handlers.share(),
  },
  {
    id: 'rename',
    label: ctx => ctx.t('playlistOptions.actions.rename'),
    icon: ctx => React.createElement(Pencil, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => !ctx.isFavorites,
    invoke: ctx => ctx.handlers.rename(),
  },
  {
    id: 'delete',
    label: ctx => ctx.t('playlistOptions.actions.delete'),
    icon: () => React.createElement(Trash2, { size: sz, color: statusColor.destructive }),
    labelColor: () => statusColor.destructive,
    visible: ctx => !ctx.isFavorites,
    enabled: ctx => !ctx.isDeleting,
    loading: ctx => ctx.isDeleting,
    dimLabel: ctx => ctx.isDeleting,
    invoke: ctx => ctx.handlers.delete(),
  },
];
