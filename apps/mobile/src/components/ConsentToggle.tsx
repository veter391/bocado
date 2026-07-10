/**
 * ConsentToggle — the deliberate, affirmative opt-in for GDPR Art. 9 health data
 * (SECURITY.md §2.A, DESIGN.md §6.D). NOT pre-ticked, NOT bundled: it's its own
 * purpose-specific control with a plain "why" description.
 *
 * Motion: presets.consentConfirm — the knob slides and a check morphs in when
 * enabled, making the consent feel weighted/deliberate (§7.9). Transform +
 * opacity only; collapses to instant under reduced motion.
 */
import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from '@/theme/useTheme';
import { minTouchTarget, radius, spacing } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motionDuration, presets } from '@/theme/motion';

export interface ConsentToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  title: string;
  description: string;
}

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const KNOB = 26;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB - 6; // 3pt inset each side

export function ConsentToggle({
  value,
  onChange,
  title,
  description,
}: ConsentToggleProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, {
      duration: motionDuration(presets.consentConfirm.d, reduceMotion),
      easing: Easing.bezier(
        presets.consentConfirm.e[0],
        presets.consentConfirm.e[1],
        presets.consentConfirm.e[2],
        presets.consentConfirm.e[3],
      ),
    });
  }, [value, reduceMotion, progress]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor:
      progress.value > 0.5 ? theme.color.primary : theme.color.surfaceDeep,
  }));

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * KNOB_TRAVEL }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));

  const toggle = useCallback(() => onChange(!value), [onChange, value]);

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      accessibilityHint={description}
      style={[
        styles.row,
        { backgroundColor: theme.color.surface, borderColor: theme.color.hairline },
      ]}
    >
      <View style={styles.copy}>
        <AppText variant="label" style={styles.title}>
          {title}
        </AppText>
        <AppText variant="caption" color="textSoft">
          {description}
        </AppText>
      </View>

      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View
          style={[styles.knob, { backgroundColor: theme.color.onPrimary }, knobStyle]}
        >
          <Animated.View style={checkStyle}>
            <Icon name="Check" size={16} color={theme.color.primary} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copy: {
    flex: 1,
    marginRight: spacing.base,
  },
  title: {
    marginBottom: 2,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: radius.full,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
