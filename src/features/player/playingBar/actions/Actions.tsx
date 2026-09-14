import React from 'react';
import { Minus, SkipForward, Heart, Dices, Cast, PlusCircle } from 'lucide-react-native';
import { PlayingBarAction } from '@/features/settings/appearance/state';
import { iconSize } from '@/constants/design';

type PlayingBarActionMeta = {
  id: PlayingBarAction;
  icon: React.ReactNode;
};

export const PLAYING_BAR_ACTIONS: PlayingBarActionMeta[] = [
  {
    id: 'none',
    icon: <Minus size={iconSize.control} />,
  },
  {
    id: 'skip',
    icon: <SkipForward size={iconSize.control} />,
  },
  {
    id: 'favorite',
    icon: <Heart size={iconSize.control} />,
  },
  {
    id: 'randomAlbum',
    icon: <Dices size={iconSize.control} />,
  },
  {
    id: 'addToPlaylist',
    icon: <PlusCircle size={iconSize.control} />,
  },
  {
    id: 'cast',
    icon: <Cast size={iconSize.control} />,
  },
];