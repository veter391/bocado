/**
 * SuitabilityDot — the verdict glyph. CRITICAL accessibility primitive: color is
 * NEVER the only signal (BRANDING.md §3, DESIGN.md §8). It always pairs
 *   colored dot + lucide icon (good=Check, caution=Clock, avoid=X) + word label.
 *
 * Entrance: presets.dotSettle (scale 0.85 -> 1) — "verdict attention" (§7.4),
 * collapsed to instant under reduced motion via motionDuration().
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from '@/theme/useTheme';
import type { SuitabilityLevel, Theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets } from '@/theme/motion';

export interface SuitabilityDotProps {
  level: SuitabilityLevel;
  /** Word label shown beside the dot (e.g. "Good now"). Defaults per level. */
  label?: string;
  /** Show the word label. Default true. When false, dot + icon only (still a11y-labeled). */
  showLabel?: boolean;
  /** Diameter of the colored dot in pt. Default 24 (icon scales with it). */
  size?: number;
}

const ICON_BY_LEVEL: Record<SuitabilityLevel, IconName> = {
  good: 'Check',
  caution: 'Clock',
  avoid: 'X',
};

const DEFAULT_LABEL: Record<SuitabilityLevel, string> = {
  good: 'Good now',
  caution: 'In moderation',
  avoid: 'Avoid now',
};

/** Screen-reader sentence (DESIGN.md §8). */
const A11Y_BY_LEVEL: Record<SuitabilityLevel, string> = {
  good: 'Good choice now',
  caution: 'Okay in moderation',
  avoid: 'Best avoided now',
};

function colorForLevel(theme: Theme, level: SuitabilityLevel): string {
  return theme.color[level];
}

export function SuitabilityDot({
  level,
  label,
  showLabel = true,
  size = 24,
}: SuitabilityDotProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const dotColor = colorForLevel(theme, level);
  const word = label ?? DEFAULT_LABEL[level];

  const scale = useSharedValue<number>(presets.dotSettle.fromScale);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const d = motionDuration(presets.dotSettle.d, reduceMotion);
    const easing = Easing.bezier(
      presets.dotSettle.e[0],
      presets.dotSettle.e[1],
      presets.dotSettle.e[2],
      presets.dotSettle.e[3],
    );
    scale.value = withTiming(1, { duration: d, easing });
    opacity.value = withTiming(1, { duration: d, easing });
  }, [level, reduceMotion, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  // Icon glyph sits inside the dot, ~58% of its diameter. Heavier stroke + the
  // dot's own soft shadow keep the verdict crisp and vivid on warm paper.
  const iconSize = Math.round(size * 0.58);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${A11Y_BY_LEVEL[level]}. ${word}`}
    >
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: dotColor,
            // Tonal glow in the dot's own hue — pops on paper, never a hard shadow.
            shadowColor: dotColor,
            shadowOpacity: 0.35,
            shadowRadius: size * 0.25,
            shadowOffset: { width: 0, height: size * 0.08 },
            elevation: 2,
          },
          animatedStyle,
        ]}
      >
        <Icon name={ICON_BY_LEVEL[level]} size={iconSize} color={theme.color.onPrimary} />
      </Animated.View>
      {showLabel ? (
        // Word uses high-contrast text color (AA on paper); the dot carries the
        // color cue, so the label never relies on a borderline-contrast hue.
        <AppText variant="label" color="text" style={styles.label}>
          {word}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginLeft: 8,
  },
});
