import React from 'react';
import { Heart, Play, Shuffle, ListStart, ListEnd, Disc, Globe, Share2, Sparkles } from 'lucide-react-native';
import type { Album } from '@/domain/entities/Album';
import { iconSize, statusColor } from '@/constants/design';
import type { ActionDef, BaseActionContext } from '../types';
import { downloadRowIcon, downloadRowLabel } from '../shared/downloadActions';

export interface AlbumLibraryActionContext extends BaseActionContext {
  kind: 'album';
  origin: 'library';
  album: Album;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string; subtext: string };
  isStarred: boolean;
  playbackDisabled: boolean;
  songsLoading: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isSharing: boolean;
  canShare: boolean;
  isGeneratingPlaylist: boolean;
  canGeneratePlaylist: boolean;
  hasExternalSources: boolean;
  hideGoToAlbum: boolean;
  handlers: {
    toggleFavorite: () => void;
    play: () => void;
    shuffle: () => void;
    addToNext: () => void;
    addToEnd: () => void;
    shuffleToQueue: () => void;
    generatePlaylist: () => void;
    goToAlbum: () => void;
    viewExternal: () => void;
    share: () => void;
    download: () => void;
  };
}

type Ctx = AlbumLibraryActionContext;
const sz = iconSize.loader;

export const albumLibraryActions: ActionDef<Ctx>[] = [
  {
    id: 'favorite',
    label: ctx => ctx.t(ctx.isStarred ? 'albumOptions.actions.unfavorite' : 'albumOptions.actions.favorite'),
    icon: ctx => React.createElement(Heart, { size: sz, color: statusColor.favorite, fill: ctx.isStarred ? statusColor.favorite : 'none' }),
    visible: () => true,
    invoke: ctx => ctx.handlers.toggleFavorite(),
  },
  {
    id: 'play',
    label: ctx => ctx.t('albumOptions.actions.play'),
    icon: ctx => React.createElement(Play, { size: sz, color: ctx.colors.secondary, fill: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    loading: ctx => ctx.songsLoading,
    invoke: ctx => ctx.handlers.play(),
  },
  {
    id: 'shuffle',
    label: ctx => ctx.t('albumOptions.actions.shuffle'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffle(),
  },
  {
    id: 'addToNext',
    label: ctx => ctx.t('albumOptions.actions.addToNext'),
    icon: ctx => React.createElement(ListStart, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.addToNext(),
  },
  {
    id: 'addToEnd',
    label: ctx => ctx.t('albumOptions.actions.addToEnd'),
    icon: ctx => React.createElement(ListEnd, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.addToEnd(),
  },
  {
    id: 'shuffleToQueue',
    label: ctx => ctx.t('albumOptions.actions.shuffleToQueue'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffleToQueue(),
  },
  {
    id: 'generatePlaylist',
    label: ctx => ctx.t('albumOptions.actions.generatePlaylist'),
    icon: ctx => React.createElement(Sparkles, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.canGeneratePlaylist,
    enabled: ctx => !ctx.isGeneratingPlaylist && !ctx.playbackDisabled,
    loading: ctx => ctx.isGeneratingPlaylist,
    invoke: ctx => ctx.handlers.generatePlaylist(),
  },
  {
    id: 'goToAlbum',
    label: ctx => ctx.t('albumOptions.actions.goToAlbum'),
    icon: ctx => React.createElement(Disc, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => !ctx.hideGoToAlbum,
    invoke: ctx => ctx.handlers.goToAlbum(),
  },
  {
    id: 'viewExternal',
    label: ctx => ctx.t('albumOptions.actions.viewExternal'),
    icon: ctx => React.createElement(Globe, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.hasExternalSources && !!ctx.album.artist?.name,
    invoke: ctx => ctx.handlers.viewExternal(),
  },
  {
    id: 'share',
    label: ctx => ctx.t('albumOptions.actions.share'),
    icon: ctx => React.createElement(Share2, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.canShare,
    enabled: ctx => !ctx.isSharing,
    loading: ctx => ctx.isSharing,
    invoke: ctx => ctx.handlers.share(),
  },
  {
    id: 'download',
    label: ctx => downloadRowLabel({
      t: ctx.t, isDownloaded: ctx.isDownloaded, isDownloading: ctx.isDownloading,
      downloadingKey: 'albumOptions.actions.downloading', downloadedKey: 'albumOptions.actions.downloaded', downloadKey: 'albumOptions.actions.download',
    }),
    icon: ctx => downloadRowIcon({ isDownloaded: ctx.isDownloaded, subtextColor: ctx.colors.subtext, secondaryColor: ctx.colors.secondary }),
    visible: () => true,
    // Tappable once downloaded too: that is where a download is removed.
    enabled: ctx => !ctx.isDownloading,
    loading: ctx => ctx.isDownloading,
    dimLabel: ctx => ctx.isDownloaded || ctx.isDownloading,
    invoke: ctx => ctx.handlers.download(),
  },
];
