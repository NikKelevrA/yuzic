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

module.exports = {
  __esModule: true,
  default: Animated,
  Easing,
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
