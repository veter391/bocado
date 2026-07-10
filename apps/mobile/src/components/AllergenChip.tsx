/**
 * AllergenChip — informational, NEVER alarmist. Frames an allergen flag as
 * "May contain {label}" and always carries ALLERGEN_DISCLAIMER ("confirm with
 * staff"). The app is not the food-information provider and must never say
 * "safe" / "allergen-free" (SECURITY.md §2.B, Reg 1169/2011).
 *
 * One calm attention pulse on mount (presets.allergenPulse, §7.8) so it's
 * noticed without alarm. Neutral surface, not red.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { AllergenFlag } from '@bocado/shared';
import { ALLERGENS, ALLERGEN_DISCLAIMER } from '@bocado/shared';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets } from '@/theme/motion';

export interface AllergenChipProps {
  flag: AllergenFlag;
}

function labelForAllergen(id: AllergenFlag['allergen']): string {
  const match = ALLERGENS.find((a) => a.id === id);
  return match ? match.label : id;
}

export function AllergenChip({ flag }: AllergenChipProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const label = labelForAllergen(flag.allergen);
  const title = `May contain ${label}`;

  // One calm pulse: scale 1 -> 1.03 -> 1. Transform only.
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) return;
    const half = motionDuration(presets.allergenPulse.d, reduceMotion) / 2;
    const easing = Easing.bezier(
      presets.allergenPulse.e[0],
      presets.allergenPulse.e[1],
      presets.allergenPulse.e[2],
      presets.allergenPulse.e[3],
    );
    scale.value = withSequence(
      withTiming(1.03, { duration: half, easing }),
      withTiming(1, { duration: half, easing }),
    );
  }, [flag.allergen, reduceMotion, scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${title}. ${ALLERGEN_DISCLAIMER}`}
      style={[
        styles.chip,
        { backgroundColor: theme.color.surfaceDeep, borderColor: theme.color.hairline },
        animatedStyle,
      ]}
    >
      <View style={styles.titleRow}>
        <Icon name="Info" size={14} color={theme.color.textSoft} />
        <AppText variant="label" style={styles.title} numberOfLines={2}>
          {title}
        </AppText>
      </View>
      <AppText variant="caption" color="textSoft" numberOfLines={2}>
        {ALLERGEN_DISCLAIMER}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    marginLeft: 6,
    flexShrink: 1,
  },
});
