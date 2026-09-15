import React from 'react';
import {
  Heart, CirclePlus, Disc, Radio, Mic2, ListEnd, ListStart, Sparkles, Moon,
} from 'lucide-react-native';
import type { Song } from '@/domain/entities/Song';
import { iconSize, statusColor, typography } from '@/constants/design';
import type { SleepTimer } from '@/features/player/sleepTimer';
import SleepTimerRemaining from '@/features/player/components/SleepTimerRemaining';
import type { ActionDef, BaseActionContext } from '../types';
import { downloadRowIcon, downloadRowLabel } from '../shared/downloadActions';

export interface SongLibraryActionContext extends BaseActionContext {
  kind: 'song';
  origin: 'library';
  song: Song;
  t: (key: string, opts?: Record<string, unknown>) => string;
  colors: { secondary: string; subtext: string };
  isStarred: boolean;
  isDownloaded: boolean;
  isDownloading: boolean;
  isGeneratingPlaylist: boolean;
  similarPlaylistAvailable: boolean;
  sleepTimer: SleepTimer;
  /** Only the player's own sheet, for the playing track, offers the timer. */
  sleepTimerAvailable: boolean;
  handlers: {
    toggleFavorite: () => void;
    addToQueue: () => void;
    addToEndQueue: () => void;
    addToPlaylist: () => void;
    sleepTimer: () => void;
    download: () => void;
    goToAlbum: () => void;
    goToArtist: () => void;
    instantMix: () => void;
    generatePlaylist: () => void;
  };
}

type Ctx = SongLibraryActionContext;
const icon = (size = iconSize.loader) => size;

export const songLibraryActions: ActionDef<Ctx>[] = [
  {
    id: 'favorite',
    label: ctx => ctx.t(ctx.isStarred ? 'songOptions.actions.unfavorite' : 'songOptions.actions.favorite'),
    icon: ctx => React.createElement(Heart, {
      size: icon(), color: statusColor.favorite, fill: ctx.isStarred ? statusColor.favorite : 'none',
    }),
    visible: () => true,
    invoke: ctx => ctx.handlers.toggleFavorite(),
  },
  {
    id: 'addToQueue',
    label: ctx => ctx.t('songOptions.actions.addToQueue'),
    icon: ctx => React.createElement(ListStart, { size: icon(), color: ctx.colors.secondary }),
    visible: () => true,
    invoke: ctx => ctx.handlers.addToQueue(),
  },
  {
    id: 'addToEnd',
    label: ctx => ctx.t('songOptions.actions.addToEnd'),
    icon: ctx => React.createElement(ListEnd, { size: icon(), color: ctx.colors.secondary }),
    visible: () => true,
    invoke: ctx => ctx.handlers.addToEndQueue(),
  },
  {
    id: 'addToPlaylist',
    label: ctx => ctx.t('songOptions.actions.addToPlaylist'),
    icon: ctx => React.createElement(CirclePlus, { size: icon(), color: ctx.colors.secondary }),
    visible: () => true,
    invoke: ctx => ctx.handlers.addToPlaylist(),
  },
  {
    id: 'sleepTimer',
    label: ctx => ctx.t('songOptions.actions.sleepTimer'),
    icon: ctx => React.createElement(Moon, { size: icon(), color: ctx.colors.secondary }),
    visible: ctx => ctx.sleepTimerAvailable,
    trailing: ctx => React.createElement(SleepTimerRemaining, {
      timer: ctx.sleepTimer,
      style: { ...typography.rowSubtitle, color: ctx.colors.subtext },
    }),
    testID: () => 'song-options-sleep-timer',
    invoke: ctx => ctx.handlers.sleepTimer(),
  },
  {
    id: 'download',
    label: ctx => downloadRowLabel({
      t: ctx.t, isDownloaded: ctx.isDownloaded, isDownloading: ctx.isDownloading,
      downloadingKey: 'songOptions.actions.downloading', downloadedKey: 'songOptions.actions.downloaded', downloadKey: 'songOptions.actions.download',
    }),
    icon: ctx => downloadRowIcon({ isDownloaded: ctx.isDownloaded, subtextColor: ctx.colors.subtext, secondaryColor: ctx.colors.secondary }),
    visible: () => true,
    enabled: ctx => !ctx.isDownloading,
    loading: ctx => ctx.isDownloading,
    dimLabel: ctx => ctx.isDownloaded || ctx.isDownloading,
    invoke: ctx => ctx.handlers.download(),
  },
  {
    id: 'goToAlbum',
    label: ctx => ctx.t('songOptions.actions.goToAlbum'),
    icon: ctx => React.createElement(Disc, { size: icon(), color: ctx.colors.secondary }),
    visible: ctx => !!ctx.song.album.nativeId,
    invoke: ctx => ctx.handlers.goToAlbum(),
  },
  {
    id: 'goToArtist',
    label: ctx => ctx.t('songOptions.actions.goToArtist'),
    icon: ctx => React.createElement(Mic2, { size: icon(), color: ctx.colors.secondary }),
    visible: ctx => !!ctx.song.artist.nativeId,
    invoke: ctx => ctx.handlers.goToArtist(),
  },
  {
    id: 'instantMix',
    label: ctx => ctx.t('songOptions.actions.instantMix'),
    icon: ctx => React.createElement(Radio, { size: icon(), color: ctx.colors.secondary }),
    visible: () => true,
    invoke: ctx => ctx.handlers.instantMix(),
  },
  {
    id: 'generatePlaylist',
    label: ctx => ctx.t('songOptions.actions.generatePlaylist'),
    icon: ctx => React.createElement(Sparkles, { size: icon(), color: ctx.colors.secondary }),
    visible: ctx => ctx.similarPlaylistAvailable,
    enabled: ctx => !ctx.isGeneratingPlaylist,
    loading: ctx => ctx.isGeneratingPlaylist,
    invoke: ctx => ctx.handlers.generatePlaylist(),
  },
];
