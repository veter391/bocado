/**
 * PressableScale — the tactile press primitive (design-v2).
 *
 * Wraps a `Pressable` in a Reanimated view that springs to `scale 0.96` on press
 * and back to `1` on release, giving every tappable surface a physical "give"
 * under the finger. Use it on dish cards, options, chips, buttons, and the scan
 * button.
 *
 * Rules honored:
 *  - transform-only (scale) — no layout, no color work on the UI thread
 *  - runs on the Reanimated UI thread via `withSpring(springs.pressScale)`
 *  - reduced-motion safe: when the OS asks for reduced motion we never scale, so
 *    the press is instant and motionless (the `onPress` still fires normally)
 *
 * It is a thin, transparent wrapper: it forwards press handling and a11y to a
 * real `Pressable`, so it composes with the platform press/ripple semantics.
 */
import React, { useCallback } from 'react';
import {
  Pressable,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { springs } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// `fromScale` is our own field, not a Reanimated `WithSpringConfig` key — strip it
// so `withSpring` only receives valid physics config.
const { fromScale: PRESSED_SCALE, ...PRESS_SPRING_CONFIG } = springs.pressScale;

export interface PressableScaleProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
}

export function PressableScale({
  onPress,
  children,
  style,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
}: PressableScaleProps): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (reduceMotion || disabled) return;
    scale.value = withSpring(PRESSED_SCALE, PRESS_SPRING_CONFIG);
  }, [reduceMotion, disabled, scale]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion || disabled) return;
    scale.value = withSpring(1, PRESS_SPRING_CONFIG);
  }, [reduceMotion, disabled, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
