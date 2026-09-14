import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { controlSize } from '@/constants/design';
import { useTheme } from '@/features/theme/useTheme';

const TITLE_FADE_MS = 180;

/** The floating bar's own height, below the status bar. Exported so a screen
 * can put something (a status banner) directly under it. */
export const DETAIL_BAR_HEIGHT = controlSize.topBarHeight;

/**
 * What a floating bar needs from the screen under it: whether the hero title
 * has scrolled away, and somewhere for that title to report where it is.
 *
 * Null on a screen with no hero — a plain list keeps a plain, always-titled
 * bar, because there is nothing else on it saying where you are.
 */
type DetailScrollValue = {
  /** 0 while the hero title is on screen, 1 once it is behind the bar. A shared
   * value rather than a boolean prop, so crossing the threshold fades the bar
   * on the UI thread without re-rendering anything inside it. */
  progress: SharedValue<number>;
  onHeroTitleLayout: (event: LayoutChangeEvent) => void;
};

const DetailScrollContext = createContext<DetailScrollValue | null>(null);

/** The screen's scroll state, or null outside a `DetailScreen`. */
export const useDetailScroll = () => useContext(DetailScrollContext);

type DetailScreenProps = {
  /** The floating bar, rendered over the list rather than above it. */
  bar: React.ReactNode;
  children: (scroll: {
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
  }) => React.ReactNode;
};

/**
 * A detail screen: a scrolling body with a bar floating over it.
 *
 * The bar used to sit *above* the list, on an opaque background, which put a
 * hard black edge across the top of every cover wash — the one thing a wash
 * must not have. Floating it lets the colour run to the top of the screen and
 * under the status bar, and lets the bar stay out of the way until there is a
 * reason for it: the title appears only once the hero's own title has scrolled
 * under it, so the screen never says the same name twice.
 */
export function DetailScreen({ bar, children }: DetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [titleVisible, setTitleVisible] = useState(false);

  // The scroll offset past which the hero title is behind the bar. Infinite
  // until the hero has laid out, so nothing shows before it is known.
  const revealAt = useRef(Number.POSITIVE_INFINITY);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(titleVisible ? 1 : 0, { duration: TITLE_FADE_MS });
  }, [titleVisible, progress]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const onHeroTitleLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    revealAt.current = y + height - insets.top - DETAIL_BAR_HEIGHT;
  }, [insets.top]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Setting the same boolean is a no-op in React, so this re-renders on the
    // two frames the threshold is crossed rather than on every scroll event.
    setTitleVisible(event.nativeEvent.contentOffset.y > revealAt.current);
  }, []);

  const scroll = useMemo(
    () => ({ progress, onHeroTitleLayout }),
    [progress, onHeroTitleLayout]
  );

  return (
    <DetailScrollContext.Provider value={scroll}>
      <View style={styles.screen}>
        {children({ onScroll, scrollEventThrottle: 16 })}
        <View
          pointerEvents="box-none"
          style={[styles.floatingBar, { paddingTop: insets.top }]}
        >
          {/* The whole overlay, status-bar strip included — painting only the
              bar left that strip transparent, so a scrolled list showed
              through above an otherwise solid header. */}
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: colors.background },
              fadeStyle,
            ]}
          />
          {bar}
        </View>
      </View>
    </DetailScrollContext.Provider>
  );
}

/**
 * Room at the top of a hero that draws its own art, for the floating bar and
 * the status bar above it.
 *
 * The artist header bleeds a blurred cover to the edges instead of using
 * `DetailHeader`, and has to leave the same gap.
 */
export function useDetailHeaderInset(): number {
  const insets = useSafeAreaInsets();
  const floating = useDetailScroll();
  return floating ? insets.top + DETAIL_BAR_HEIGHT : 0;
}

/**
 * `onLayout` for a hero's own title, so the floating bar knows when to show
 * its copy of it. Undefined outside a `DetailScreen`, where there is no bar
 * waiting on it.
 */
export function useDetailHeroTitleLayout(): ((event: LayoutChangeEvent) => void) | undefined {
  return useDetailScroll()?.onHeroTitleLayout;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  floatingBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
