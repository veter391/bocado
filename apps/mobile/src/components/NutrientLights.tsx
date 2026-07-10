/**
 * NutrientLights — the CENTERPIECE of the dish detail (Direction A "Nutrient
 * lights"). Renders a per-nutrient traffic-light card: each row is a colored dot
 * (with an icon), the nutrient label, a tag word, a thin animated fill bar, and
 * the per-portion range value.
 *
 * It consumes `NutrientLight[]` from the deterministic engine
 * (`rateNutrients(dish.nutrition)`) — it never computes a number itself. The
 * level -> color mapping is Direction A's: good -> green, caution -> amber,
 * high -> red (resolved via `nutrientColors`).
 *
 * Accessibility: color is never alone. Each dot carries an ICON (good=Check,
 * caution/high=Minus), the row has a tag WORD, and the whole row exposes a
 * spoken sentence ("Calories: High, 680 to 820 kcal").
 *
 * Motion: each bar grows from 0 to its `fillPct` width and each dot pops in,
 * lightly staggered down the list (Direction A's barGrow / dotPop). Reduced
 * motion -> bars are at full width and dots at full scale instantly. Gated via
 * `motionDuration` / `staggerDelay`.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { NutrientLight } from '@bocado/shared';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { nutrientColors, type Theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets, staggerDelay } from '@/theme/motion';

export interface NutrientLightsProps {
  /** Rows from the engine's `rateNutrients(...)`, already in display order. */
  lights: NutrientLight[];
}

/** Dot icon per level — concern levels share a single "Minus" bar glyph (A). */
const ICON_BY_LEVEL: Record<NutrientLight['level'], IconName> = {
  good: 'Check',
  caution: 'Minus',
  high: 'Minus',
};

export function NutrientLights({ lights }: NutrientLightsProps): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline },
      ]}
    >
      {lights.map((light, index) => (
        <NutrientRow
          key={light.key}
          light={light}
          index={index}
          showDivider={index > 0}
        />
      ))}
    </View>
  );
}

function NutrientRow({
  light,
  index,
  showDivider,
}: {
  light: NutrientLight;
  index: number;
  showDivider: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);
  const colors = nutrientColors(theme, light.level);

  // Bar grows 0 -> fillPct%. Dot pops 0 -> 1. Staggered down the list.
  const fillW = useSharedValue(reduceMotion ? light.fillPct : 0);
  const dotScale = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      fillW.value = light.fillPct;
      dotScale.value = 1;
      return;
    }
    const delay = staggerDelay(index, reduceMotion);
    const d = motionDuration(presets.estimateBarFill.d, reduceMotion);
    const easing = Easing.bezier(
      presets.estimateBarFill.e[0],
      presets.estimateBarFill.e[1],
      presets.estimateBarFill.e[2],
      presets.estimateBarFill.e[3],
    );
    dotScale.value = withDelay(delay, withTiming(1, { duration: motionDuration(presets.dotSettle.d, reduceMotion), easing }));
    fillW.value = withDelay(delay, withTiming(light.fillPct, { duration: d, easing }));
  }, [light.fillPct, index, reduceMotion, fillW, dotScale]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fillW.value}%` }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  const rangeText = `${light.range.min}–${light.range.max}`;
  const a11y = `${light.label}: ${light.tag}, ${light.range.min} to ${light.range.max} ${light.range.unit}`;

  return (
    <View
      style={[styles.row, showDivider && { borderTopColor: theme.color.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={a11y}
    >
      {/* Colored dot with icon — color is never the only signal. */}
      <Animated.View style={[styles.dot, { backgroundColor: colors.solid }, dotStyle]}>
        <Icon name={ICON_BY_LEVEL[light.level]} size={11} color={theme.color.onPrimary} />
      </Animated.View>

      <View style={styles.mid}>
        <View style={styles.labelRow}>
          <AppText variant="label" numberOfLines={1} style={styles.label}>
            {light.label}
          </AppText>
          <View style={[styles.tag, { backgroundColor: colors.soft }]}>
            <AppText variant="caption" style={[styles.tagText, { color: colors.text }]}>
              {light.tag.toUpperCase()}
            </AppText>
          </View>
        </View>
        {/* Thin animated fill bar — level color, width = fillPct. */}
        <View style={[styles.barTrack, { backgroundColor: theme.color.surfaceRecessed }]}>
          <Animated.View style={[styles.barFill, { backgroundColor: colors.solid }, fillStyle]} />
        </View>
      </View>

      <View style={styles.valueCol}>
        <AppText variant="data" numberOfLines={1}>
          {rangeText}
        </AppText>
        <AppText variant="caption" color="textFaint">
          {light.range.unit}
        </AppText>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      borderRadius: theme.radius.rLg,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: theme.spacing.xs,
      ...theme.elevation.e1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
    },
    dot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mid: {
      flex: 1,
      minWidth: 0,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    label: {
      flexShrink: 1,
    },
    tag: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    tagText: {
      fontSize: 9.5,
      lineHeight: 13,
      letterSpacing: 0.5,
    },
    barTrack: {
      marginTop: 8,
      height: 6,
      borderRadius: theme.radius.full,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      borderRadius: theme.radius.full,
    },
    valueCol: {
      alignItems: 'flex-end',
      minWidth: 56,
    },
  });
}
