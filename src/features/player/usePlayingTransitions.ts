import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type PlayingViewMode = 'player' | 'queue';

const MODE_FADE_MS = 300;

/** The crossfade between the player and the queue on the playing screen. */
export function usePlayingTransitions(
  mode: PlayingViewMode,
  coverVisibility: SharedValue<number>,
) {
  const playerOpacity = useSharedValue(1);
  const queueOpacity = useSharedValue(0);

  useEffect(() => {
    playerOpacity.value = withTiming(mode === 'player' ? 1 : 0, { duration: MODE_FADE_MS });
    queueOpacity.value = withTiming(mode === 'queue' ? 1 : 0, { duration: MODE_FADE_MS });
    // The cover art is not ours to fade — the host draws it above this
    // screen so it can travel to and from the bar — so it is told to go
    // with the player it belongs to. Without this it stayed put: a
    // full-width square of artwork sitting on top of the queue.
    coverVisibility.value = withTiming(mode === 'player' ? 1 : 0, { duration: MODE_FADE_MS });
  }, [mode, playerOpacity, queueOpacity, coverVisibility]);

  const playerStyle = useAnimatedStyle(() => ({
    opacity: playerOpacity.value,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  const queueStyle = useAnimatedStyle(() => ({
    opacity: queueOpacity.value,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  return { playerStyle, queueStyle };
}
