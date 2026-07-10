/**
 * Skeleton — shimmer placeholder sized to final content so there's no layout
 * jump when real content arrives (DESIGN.md §7.10 / UX "no content jumping").
 *
 * Shimmer is a looping opacity pulse on the UI thread (Reanimated). Under
 * reduced motion it renders as a calm static block (no loop).
 */
import React, { useEffect } from 'react';
import { type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/useTheme';
import { radius as radiusTokens } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  /** Corner radius in pt. Default radius.sm (8). */
  radius?: number;
}

export function Skeleton({ width, height, radius = radiusTokens.sm }: SkeletonProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 0.5;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [reduceMotion, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.color.surfaceDeep },
        animatedStyle,
      ]}
    />
  );
}
