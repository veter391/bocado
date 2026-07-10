/**
 * EstimateBar — nutrition shown honestly as RANGES, never hard numbers
 * (BRANDING.md voice, SECURITY.md §2.D, Reg 1924/2006). A kcal band fills
 * left -> right to communicate "estimate / range", not a fixed truth (DESIGN.md
 * §7.7 estimateBarFill); the macros sit in an aligned tabular row; and
 * NUTRITION_DISCLAIMER + source attribution (CIQUAL/USDA) are always present.
 *
 * No health-claim language anywhere — purely descriptive.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { NutritionEstimate, Range } from '@bocado/shared';
import { NUTRITION_DISCLAIMER } from '@bocado/shared';

import { AppText } from './AppText';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets } from '@/theme/motion';

export interface EstimateBarProps {
  estimate: NutritionEstimate;
}

function rangeText(range: Range): string {
  return `~${range.min}–${range.max} ${range.unit}`;
}

/** Higher confidence reads as a fuller band; all stay visibly a "range". */
const FILL_BY_CONFIDENCE: Record<NutritionEstimate['confidence'], number> = {
  low: 0.5,
  medium: 0.7,
  high: 0.88,
};

interface MacroProps {
  label: string;
  range?: Range;
}

function Macro({ label, range }: MacroProps): React.JSX.Element {
  return (
    <View style={styles.macro}>
      <AppText variant="caption" color="textSoft" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="data" numberOfLines={1}>
        {range ? rangeText(range) : '—'}
      </AppText>
    </View>
  );
}

export function EstimateBar({ estimate }: EstimateBarProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { kcal } = estimate;

  const target = FILL_BY_CONFIDENCE[estimate.confidence];
  const fill = useSharedValue(0);

  useEffect(() => {
    const d = motionDuration(presets.estimateBarFill.d, reduceMotion);
    const easing = Easing.bezier(
      presets.estimateBarFill.e[0],
      presets.estimateBarFill.e[1],
      presets.estimateBarFill.e[2],
      presets.estimateBarFill.e[3],
    );
    fill.value = withTiming(target, { duration: d, easing });
  }, [target, reduceMotion, fill]);

  // Transform-only fill (scaleX from a left origin) so the animation stays on
  // the UI thread and never drives layout (DESIGN.md §7 rule).
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));

  const sourceNames = estimate.sources.map((s) => s.name).filter(Boolean);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Estimated energy ${rangeText(kcal)}. ${NUTRITION_DISCLAIMER}`}
      style={[styles.card, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
    >
      {/* Large, tracking-tight kcal range — the headline number block (design-v2). */}
      <AppText variant="label" color="textSoft" style={styles.kcalCaption}>
        Energy
      </AppText>
      <View style={styles.kcalBlock}>
        <AppText variant="display" style={styles.kcalNumber} numberOfLines={1}>
          {`${kcal.min}–${kcal.max}`}
        </AppText>
        <AppText variant="label" color="textSoft" style={styles.kcalUnit}>
          {kcal.unit}
        </AppText>
      </View>

      <View
        style={[styles.track, { backgroundColor: theme.color.surfaceDeep }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.fill, { backgroundColor: theme.color.primary }, fillStyle]} />
      </View>

      <View style={styles.macros}>
        <Macro label="Protein" range={estimate.protein} />
        <Macro label="Fat" range={estimate.fat} />
        <Macro label="Carbs" range={estimate.carbs} />
        <Macro label="Salt" range={estimate.salt} />
      </View>

      <AppText variant="caption" color="textSoft" style={styles.disclaimer}>
        {NUTRITION_DISCLAIMER}
      </AppText>

      {sourceNames.length > 0 ? (
        <AppText variant="caption" color="textSoft" numberOfLines={2}>
          {`Source: ${sourceNames.join(', ')}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kcalCaption: {
    marginBottom: 2,
  },
  kcalBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.md,
  },
  kcalNumber: {
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1, // tracking-tight
    fontVariant: ['tabular-nums'],
  },
  kcalUnit: {
    marginLeft: spacing.sm,
  },
  track: {
    height: 10,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: radius.full,
    transformOrigin: 'left',
  },
  macros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.base,
    marginHorizontal: -spacing.xs,
  },
  macro: {
    minWidth: '25%',
    flexGrow: 1,
    flexBasis: '22%',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  disclaimer: {
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});
