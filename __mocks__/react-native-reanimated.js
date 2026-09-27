/**
 * Reanimated 4 runs animations on worklets, which need the native runtime:
 * importing the real module under Jest throws
 * "Native part of Worklets doesn't seem to be initialized" before a single
 * component renders. Reanimated's own `react-native-reanimated/mock` is
 * untranspiled TypeScript that re-enters the real entrypoint, so it does not
 * help here.
 *
 * This covers the surface the app actually imports. Animations resolve to
 * their final value immediately, which is what a test wants: assert where a
 * view ends up, never mid-flight. Without it, every screen that animates has
 * to stub out its own children, and a test that renders only placeholders
 * asserts nothing.
 */
const React = require('react');
const { View, Text, ScrollView } = require('react-native');

const passthrough = value => value;
const noop = () => {};

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: Component => Component,
};

const Easing = new Proxy(
  {},
  {
    get: () => {
      const easing = passthrough;
      // Easing.out(Easing.cubic) and friends: every member is callable and
      // returns another easing.
      return Object.assign(easing, { factory: () => easing });
    },
  }
);

/**
 * A layout animation, as a builder that answers to anything.
 *
 * `FadeIn.duration(240).delay(30).withInitialValues({...})` is a chain of
 * builder calls ending in a descriptor the native side consumes; under Jest
 * there is no native side, and the mocked `Animated.View` is a plain `View`
 * that ignores the `entering` prop entirely. So every link in the chain just
 * has to exist and return something chainable. Proxied rather than
 * enumerated because the chain's vocabulary is large (`springify`,
 * `randomDelay`, `reduceMotion`, `easing`, `build`, …) and a test should not
 * fail because a component reached for a link nobody listed yet.
 */
const layoutAnimation = () =>
  new Proxy(function () {}, {
    get: (target, prop) => (prop === 'name' ? 'MockLayoutAnimation' : layoutAnimation()),
    apply: () => layoutAnimation(),
  });

// Named so the import exists; each is the same do-nothing builder.
const LAYOUT_ANIMATIONS = [
  'FadeIn', 'FadeOut',
  'FadeInDown', 'FadeInUp', 'FadeOutDown', 'FadeOutUp',
  'SlideInLeft', 'SlideInRight', 'SlideOutLeft', 'SlideOutRight',
  'ZoomIn', 'ZoomOut',
  'LinearTransition', 'CurvedTransition', 'FadingTransition',
];

module.exports = {
  __esModule: true,
  default: Animated,
  Easing,
  ...Object.fromEntries(LAYOUT_ANIMATIONS.map(name => [name, layoutAnimation()])),
  useSharedValue: initial => React.useRef({ value: initial }).current,
  useAnimatedStyle: factory => factory(),
  useAnimatedReaction: noop,
  withTiming: passthrough,
  withSpring: passthrough,
  withRepeat: passthrough,
  cancelAnimation: noop,
  runOnJS: fn => fn,
  interpolate: passthrough,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
};
