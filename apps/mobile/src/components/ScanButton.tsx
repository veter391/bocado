/**
 * ScanButton — the hero primary action (DESIGN.md §5, BRANDING.md §5). Coral,
 * pill-shaped, >= 64pt tall so it's the unmistakable single action on a screen.
 * A short press-in scale gives tactile feedback (micro, transform only,
 * reduced-motion aware).
 *
 * (The Scan screen draws its own circular shutter; this is the reusable labelled
 * FAB for any other entry point that needs "Scan menu".)
 */
import React, { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { duration as motionDur, easing as easingTokens, motionDuration } from '@/theme/motion';

export interface ScanButtonProps {
  onPress: () => void;
  /** Button text. Default "Scan menu". */
  label?: string;
}

const MIN_HEIGHT = 64;

export function ScanButton({ onPress, label = 'Scan menu' }: ScanButtonProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animate = useCallback(
    (to: number) => {
      scale.value = withTiming(to, {
        duration: motionDuration(motionDur.micro, reduceMotion),
        easing: Easing.bezier(
          easingTokens.out[0],
          easingTokens.out[1],
          easingTokens.out[2],
          easingTokens.out[3],
        ),
      });
    },
    [scale, reduceMotion],
  );

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? theme.color.primaryPressed : theme.color.primary,
            ...theme.elevation.e2,
          },
        ]}
      >
        <Icon name="Camera" size={24} color={theme.color.onPrimary} />
        <AppText variant="label" color="onPrimary" style={styles.label} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.full,
  },
  label: {
    marginLeft: spacing.sm,
    fontSize: 16,
  },
});
