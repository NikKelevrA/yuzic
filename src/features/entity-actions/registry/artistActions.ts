import React from 'react';
import { ListEnd, Play, Shuffle, User, Globe, Sparkles, CheckCircle, ArrowDownCircle } from 'lucide-react-native';
import type { Artist } from '@/domain/entities/Artist';
import { iconSize } from '@/constants/design';
import type { ActionDef, BaseActionContext } from '../types';
import { downloadRowLabel } from '../shared/downloadActions';

export interface ArtistActionContext extends BaseActionContext {
  kind: 'artist';
  origin: 'library';
  artist: Artist;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string; subtext: string };
  playbackDisabled: boolean;
  songsLoading: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isGeneratingPlaylist: boolean;
  canGeneratePlaylist: boolean;
  hasExternalSources: boolean;
  hideGoToArtist: boolean;
  handlers: {
    play: () => void;
    shuffle: () => void;
    addToQueue: () => void;
    shuffleToQueue: () => void;
    generatePlaylist: () => void;
    downloadAll: () => void;
    goToArtist: () => void;
    viewExternal: () => void;
  };
}

type Ctx = ArtistActionContext;
const sz = iconSize.loader;

export const artistActions: ActionDef<Ctx>[] = [
  {
    id: 'play',
    label: ctx => ctx.t('artistOptions.actions.play'),
    icon: ctx => React.createElement(Play, { size: sz, color: ctx.colors.secondary, fill: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    loading: ctx => ctx.songsLoading,
    invoke: ctx => ctx.handlers.play(),
  },
  {
    id: 'shuffle',
    label: ctx => ctx.t('artistOptions.actions.shuffle'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffle(),
  },
  {
    id: 'addToQueue',
    label: ctx => ctx.t('artistOptions.actions.addToQueue'),
    icon: ctx => React.createElement(ListEnd, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.addToQueue(),
  },
  {
    id: 'shuffleToQueue',
    label: ctx => ctx.t('artistOptions.actions.shuffleToQueue'),
    icon: ctx => React.createElement(Shuffle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.playbackDisabled,
    dimRow: ctx => ctx.playbackDisabled,
    invoke: ctx => ctx.handlers.shuffleToQueue(),
  },
  {
    id: 'generatePlaylist',
    label: ctx => ctx.t('artistOptions.actions.generatePlaylist'),
    icon: ctx => React.createElement(Sparkles, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.canGeneratePlaylist,
    enabled: ctx => !ctx.isGeneratingPlaylist && !ctx.playbackDisabled,
    loading: ctx => ctx.isGeneratingPlaylist,
    invoke: ctx => ctx.handlers.generatePlaylist(),
  },
  {
    id: 'download',
    label: ctx => downloadRowLabel({
      t: ctx.t, isDownloaded: ctx.isDownloaded, isDownloading: ctx.isDownloading,
      downloadingKey: 'artistOptions.actions.downloading', downloadedKey: 'artistOptions.actions.downloaded', downloadKey: 'artistOptions.actions.download',
    }),
    icon: ctx => ctx.isDownloaded
      ? React.createElement(CheckCircle, { size: sz, color: ctx.colors.subtext })
      : React.createElement(ArrowDownCircle, { size: sz, color: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !(ctx.isDownloaded || ctx.isDownloading),
    loading: ctx => ctx.isDownloading,
    dimLabel: ctx => ctx.isDownloaded || ctx.isDownloading,
    invoke: ctx => ctx.handlers.downloadAll(),
  },
  {
    id: 'goToArtist',
    label: ctx => ctx.t('artistOptions.actions.goToArtist'),
    icon: ctx => React.createElement(User, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => !ctx.hideGoToArtist,
    invoke: ctx => ctx.handlers.goToArtist(),
  },
  {
    id: 'viewExternal',
    label: ctx => ctx.t('artistOptions.actions.viewExternal'),
    icon: ctx => React.createElement(Globe, { size: sz, color: ctx.colors.secondary }),
    visible: ctx => ctx.hasExternalSources,
    invoke: ctx => ctx.handlers.viewExternal(),
  },
];
