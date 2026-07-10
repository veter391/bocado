/**
 * DishCard — one row in the results list. The "glance" unit (DESIGN.md §2, §5):
 *   suitability dot + word · translated name (2 lines) · ~kcal range · thumbnail · chevron.
 * Whole row is tappable and >= 44pt tall.
 *
 * Entrance: presets.resultsReveal (fade + rise) with staggerDelay(index) so cards
 * cascade top -> bottom — teaches reading order and signals top = best match (§7.3).
 * The card owns this stagger (the list just feeds dishes in ranked order).
 *
 * Press feedback: the whole row is a <PressableScale> (spring to 0.96), giving a
 * tactile, premium press without extra animated elements (DESIGN.md §7 rule).
 *
 * Thumbnail: expo-image with a Skeleton placeholder (no layout jump, §7.10) and an
 * AIBadge overlay when the image is AI-generated (SECURITY.md §2.C). The badge is
 * clipped INSIDE the thumbnail (the thumb wrapper hides overflow), so it can never
 * spill past the card's right edge at any device width (320–430).
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import type { Dish } from '@bocado/shared';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { SuitabilityDot } from './SuitabilityDot';
import { useTheme } from '@/theme/useTheme';
import { useEntitlement } from '@/store/entitlement';
import { dishThumb } from '@/assets/dishImages';
import { minTouchTarget, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets, staggerDelay } from '@/theme/motion';

export interface DishCardProps {
  dish: Dish;
  index: number;
  onPress: () => void;
}

const THUMB_SIZE = 64;

function kcalRangeText(dish: Dish): string | null {
  const kcal = dish.nutrition?.kcal;
  if (!kcal) return null;
  return `~${kcal.min}–${kcal.max} kcal`;
}

export function DishCard({ dish, index, onPress }: DishCardProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const kcal = kcalRangeText(dish);
  const { isPro } = useEntitlement();
  const thumb = dishThumb(dish.translatedName, index, isPro);

  // Entrance: fade + rise, staggered by index.
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    const d = motionDuration(presets.resultsReveal.d, reduceMotion);
    const delay = staggerDelay(index, reduceMotion);
    const easing = Easing.bezier(
      presets.resultsReveal.e[0],
      presets.resultsReveal.e[1],
      presets.resultsReveal.e[2],
      presets.resultsReveal.e[3],
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: d, easing }));
    translateY.value = withDelay(delay, withTiming(0, { duration: d, easing }));
  }, [index, reduceMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const a11yLabel = [dish.suitability.label, dish.translatedName, kcal ?? undefined]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View style={[styles.wrap, animatedStyle]}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        style={[
          styles.card,
          {
            backgroundColor: theme.color.surface,
            borderColor: theme.color.hairline,
            ...theme.elevation.e1,
          },
        ]}
      >
        <View style={styles.dotCol}>
          <SuitabilityDot level={dish.suitability.level} showLabel={false} size={22} />
        </View>

        <View style={styles.body}>
          <AppText variant="label" color="textSoft" numberOfLines={1}>
            {dish.suitability.label}
          </AppText>
          <AppText variant="title" numberOfLines={2} style={styles.name}>
            {dish.translatedName}
          </AppText>
          {kcal ? (
            <AppText variant="data" color="textSoft" numberOfLines={1}>
              {kcal}
            </AppText>
          ) : null}
        </View>

        {/* Thumbnail wrapper clips its children (overflow hidden), so the AI badge
            overlay is constrained inside the thumbnail and can never spill past the
            card edge at any width (the overflow bug fix). */}
        {/* Every dish shows an AI illustration thumbnail. FREE = blurred placeholder
            + lock (upsell tease); PRO = the sharp image. Both keep the "AI" label
            (EU AI Act). The wrapper clips children so nothing spills past the card. */}
        <View style={styles.thumbWrap}>
          <Image
            source={thumb.source}
            style={styles.thumb}
            contentFit="cover"
            transition={motionDuration(presets.skeletonCrossfade.d, reduceMotion)}
            accessibilityIgnoresInvertColors
          />
          {!isPro ? (
            <View style={styles.lockChip} pointerEvents="none">
              <Icon name="Lock" size={10} color="#FFFFFF" />
            </View>
          ) : null}
          <View style={styles.aiTag} pointerEvents="none">
            <Text style={styles.aiTagText}>AI</Text>
          </View>
        </View>

        <Icon name="ChevronRight" size={20} color={theme.color.textSoft} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md, // 12pt list gap
  },
  card: {
    minHeight: Math.max(minTouchTarget, THUMB_SIZE + spacing.base * 2),
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base, // 16pt card padding
    borderRadius: radius.lg, // softer 20pt cards
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  dotCol: {
    marginRight: spacing.md,
  },
  body: {
    flex: 1,
    marginRight: spacing.md,
    minWidth: 0,
  },
  name: {
    marginTop: 2,
    marginBottom: 2,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    marginRight: spacing.md,
    borderRadius: radius.md,
    // Clip the AI badge to the thumbnail bounds — it can never overflow the card.
    overflow: 'hidden',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.md,
  },
  lockChip: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27,25,22,0.55)',
  },
  aiTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    backgroundColor: 'rgba(27,25,22,0.6)',
  },
  aiTagText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
