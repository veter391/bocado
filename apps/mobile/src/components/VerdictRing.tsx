/**
 * VerdictRing — Direction A's SIGNATURE motif. A stroked ring that fills on load,
 * carrying the dish verdict. It appears twice in the app:
 *   - `variant="list"` (~50px): the per-dish verdict on each results row.
 *   - `variant="hero"` (~168px): the centerpiece of the dish detail, with an icon,
 *     the verdict word, and a sub-line.
 *
 * Accessibility (DESIGN.md §8 / BRANDING.md §3): color is NEVER the only signal —
 * the ring always pairs its hue with the level's lucide icon (good=Check,
 * caution=Clock, avoid=X) and, on the hero, the verdict WORD. The whole thing
 * carries one screen-reader sentence.
 *
 * Motion: the colored progress stroke animates from empty to `fillPct` via
 * Reanimated on the UI thread (animating SVG `strokeDashoffset`), easing-out.
 * Reduced motion -> the stroke is set to its final offset instantly (no sweep),
 * and the hero center does not pop. Gated through `motionDuration`.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { verdictColors, type SuitabilityLevel, type Theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets } from '@/theme/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type VerdictRingVariant = 'list' | 'hero';

export interface VerdictRingProps {
  level: SuitabilityLevel;
  variant?: VerdictRingVariant;
  /** Fraction of the ring to fill, 0..1. Defaults per level (good full, caution/avoid high). */
  fillPct?: number;
  /** Verdict word shown in the hero center (e.g. "Avoid"). Defaults per level. */
  word?: string;
  /** Sub-line under the hero word (e.g. "Heavy for late"). Hero only. */
  subWord?: string;
  /** Stagger the fill start (list rows cascade). Seconds-equivalent ms. Default 0. */
  delayMs?: number;
}

const ICON_BY_LEVEL: Record<SuitabilityLevel, IconName> = {
  good: 'Check',
  caution: 'Clock',
  avoid: 'X',
};

const DEFAULT_WORD: Record<SuitabilityLevel, string> = {
  good: 'Good',
  caution: 'Caution',
  avoid: 'Avoid',
};

const A11Y_BY_LEVEL: Record<SuitabilityLevel, string> = {
  good: 'Good choice now',
  caution: 'Okay in moderation',
  avoid: 'Best avoided now',
};

/** Default ring fill per level — good rings read "complete", concerns read high-but-not-full. */
const DEFAULT_FILL: Record<SuitabilityLevel, number> = {
  good: 1,
  caution: 0.62,
  avoid: 0.92,
};

interface RingGeometry {
  box: number;
  radius: number;
  strokeWidth: number;
  iconSize: number;
}

const GEOMETRY: Record<VerdictRingVariant, RingGeometry> = {
  list: { box: 44, radius: 19, strokeWidth: 4, iconSize: 14 },
  hero: { box: 168, radius: 76, strokeWidth: 11, iconSize: 20 },
};

export function VerdictRing({
  level,
  variant = 'list',
  fillPct,
  word,
  subWord,
  delayMs = 0,
}: VerdictRingProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const colors = verdictColors(theme, level);
  const geo = GEOMETRY[variant];

  const fill = clamp01(fillPct ?? DEFAULT_FILL[level]);
  const circumference = 2 * Math.PI * geo.radius;
  const targetOffset = circumference * (1 - fill);

  // progress: 1 = empty (full dashoffset), 0 = filled to target.
  const progress = useSharedValue(reduceMotion ? 0 : 1);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0;
      return;
    }
    progress.value = 1;
    const d = motionDuration(variant === 'hero' ? presets.cardToDetail.d : presets.resultsReveal.d, reduceMotion);
    const easing = Easing.bezier(
      presets.resultsReveal.e[0],
      presets.resultsReveal.e[1],
      presets.resultsReveal.e[2],
      presets.resultsReveal.e[3],
    );
    progress.value = withDelay(delayMs, withTiming(0, { duration: d, easing }));
  }, [level, fill, reduceMotion, variant, delayMs, progress]);

  // Map progress (1..0) to dashoffset (circumference..targetOffset).
  const dashOffset = useDerivedValue(
    () => targetOffset + (circumference - targetOffset) * progress.value,
  );

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const center = geo.box / 2;

  return (
    <View
      style={[styles.wrap, { width: geo.box, height: geo.box }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${A11Y_BY_LEVEL[level]}. ${word ?? DEFAULT_WORD[level]}`}
    >
      <Svg width={geo.box} height={geo.box}>
        {/* Track */}
        <Circle
          cx={center}
          cy={center}
          r={geo.radius}
          fill="none"
          stroke={theme.color.surfaceRecessed}
          strokeWidth={geo.strokeWidth}
        />
        {/* Progress — rotated -90deg so it fills from the top, like the mockup. */}
        <AnimatedCircle
          cx={center}
          cy={center}
          r={geo.radius}
          fill="none"
          stroke={colors.solid}
          strokeWidth={geo.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          // rotate the whole circle so the cap starts at 12 o'clock.
          originX={center}
          originY={center}
          rotation={-90}
        />
      </Svg>

      {variant === 'list' ? (
        <View style={styles.center} pointerEvents="none">
          <Icon name={ICON_BY_LEVEL[level]} size={geo.iconSize} color={colors.solid} />
        </View>
      ) : (
        <HeroCenter
          theme={theme}
          colors={colors}
          level={level}
          word={word ?? DEFAULT_WORD[level]}
          subWord={subWord}
          reduceMotion={reduceMotion}
        />
      )}
    </View>
  );
}

function HeroCenter({
  theme,
  colors,
  level,
  word,
  subWord,
  reduceMotion,
}: {
  theme: Theme;
  colors: ReturnType<typeof verdictColors>;
  level: SuitabilityLevel;
  word: string;
  subWord?: string;
  reduceMotion: boolean;
}): React.JSX.Element {
  // The center pops in after the ring sweep (Direction A's popIn), instant under
  // reduced motion.
  const scale = useSharedValue(reduceMotion ? 1 : 0.8);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    const d = motionDuration(presets.dotSettle.d, reduceMotion);
    const easing = Easing.bezier(
      presets.dotSettle.e[0],
      presets.dotSettle.e[1],
      presets.dotSettle.e[2],
      presets.dotSettle.e[3],
    );
    scale.value = withDelay(presets.cardToDetail.d, withTiming(1, { duration: d, easing }));
    opacity.value = withDelay(presets.cardToDetail.d, withTiming(1, { duration: d, easing }));
  }, [level, reduceMotion, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.center, animatedStyle]} pointerEvents="none">
      <View style={[styles.heroIcon, { backgroundColor: colors.soft }]}>
        <Icon name={ICON_BY_LEVEL[level]} size={20} color={colors.solid} />
      </View>
      <AppText variant="display" style={[styles.heroWord, { color: colors.solid }]}>
        {word}
      </AppText>
      {subWord ? (
        <AppText variant="caption" color="textSoft" style={styles.heroSub}>
          {subWord.toUpperCase()}
        </AppText>
      ) : null}
    </Animated.View>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroWord: {
    fontSize: 21,
    lineHeight: 26,
  },
  heroSub: {
    marginTop: 2,
    letterSpacing: 1,
    fontSize: 11,
  },
});
