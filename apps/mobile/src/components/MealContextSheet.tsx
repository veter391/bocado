/**
 * MealContextSheet — the "what meal is this?" override picker (no new dependency).
 *
 * The Scan screen DEFAULTS the meal context to the device's real current time-of-day
 * (mealContextForHour(now)); this sheet lets the user OVERRIDE it before analyzing —
 * e.g. reading a dinner menu at lunchtime, or marking a between-meals snack. `snack` is
 * intentionally only reachable HERE (it is never derived from the clock — see
 * mealContextForHour / SNACK_CONTEXT_NOTE), so it always appears as an explicit choice.
 *
 * It mirrors the FilterSheet / HistorySheet overlay pattern exactly — scrim + bottom
 * panel on the warm-cream `surfaceRaised`, motion gated through `motionDuration(...)`
 * for reduced-motion — and is built only from existing primitives (AppText, Icon,
 * PressableScale) + theme tokens. No personal data: the meal context is a time-of-day
 * class, not identity.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { MealContext } from '@bocado/shared';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';
import { motionDuration, presets, springs } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** The selectable meal contexts, in time-of-day order; snack last (explicit only). */
const OPTIONS: { id: MealContext; label: string; hint: string }[] = [
  { id: 'breakfast', label: 'Breakfast', hint: 'Morning' },
  { id: 'lunch', label: 'Lunch', hint: 'Midday' },
  { id: 'dinner', label: 'Dinner', hint: 'Evening' },
  { id: 'late-night', label: 'Late night', hint: 'After hours' },
  { id: 'snack', label: 'Snack', hint: 'Between meals' },
];

export interface MealContextSheetProps {
  /** Whether the sheet is mounted/visible. */
  open: boolean;
  /** Dismiss the sheet (scrim tap, close button, or hardware back). */
  onClose: () => void;
  /** The currently-active meal context (defaulted from the clock, or a prior override). */
  value: MealContext;
  /** Apply a chosen context. The host closes the sheet. */
  onChange: (context: MealContext) => void;
}

export function MealContextSheet({
  open,
  onClose,
  value,
  onChange,
}: MealContextSheetProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);

  const progress = useSharedValue(0);
  const panelY = useSharedValue(reduceMotion ? 0 : 28);
  useEffect(() => {
    const d = motionDuration(presets.cardToDetail.d, reduceMotion);
    const easing = Easing.bezier(
      presets.cardToDetail.e[0],
      presets.cardToDetail.e[1],
      presets.cardToDetail.e[2],
      presets.cardToDetail.e[3],
    );
    if (open) {
      progress.value = withTiming(1, { duration: d, easing });
      panelY.value = reduceMotion ? 0 : withSpring(0, springs.selectSpring);
    } else {
      progress.value = withTiming(0, { duration: d, easing });
      panelY.value = reduceMotion ? 0 : 28;
    }
  }, [open, reduceMotion, progress, panelY]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: panelY.value }],
  }));

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close meal time picker"
          />
        </Animated.View>

        <Animated.View style={[styles.panel, panelStyle]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <AppText variant="title">Meal time</AppText>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close meal time picker"
              style={styles.closeBtn}
            >
              <Icon name="X" size={18} color={theme.color.textSoft} />
            </PressableScale>
          </View>
          <AppText variant="caption" color="textSoft" style={styles.subtitle}>
            We picked this from the time of day. Change it if you like.
          </AppText>

          <View style={styles.options}>
            {OPTIONS.map((opt) => {
              const selected = opt.id === value;
              return (
                <PressableScale
                  key={opt.id}
                  onPress={() => onChange(opt.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.label}${selected ? ', selected' : ''}`}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? theme.color.primarySoft : theme.color.surface,
                      borderColor: selected ? theme.color.primary : theme.color.hairline,
                    },
                  ]}
                >
                  <View style={styles.optionText}>
                    <AppText
                      variant="label"
                      color={selected ? 'primary' : 'text'}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </AppText>
                    <AppText variant="caption" color="textFaint" numberOfLines={1}>
                      {opt.hint}
                    </AppText>
                  </View>
                  {selected ? (
                    <View style={[styles.check, { backgroundColor: theme.color.primary }]}>
                      <Icon name="Check" size={14} color={theme.color.onPrimary} />
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    scrim: { backgroundColor: 'rgba(0,0,0,0.4)' },
    panel: {
      backgroundColor: theme.color.surfaceRaised,
      borderTopLeftRadius: theme.radius.xl,
      borderTopRightRadius: theme.radius.xl,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: theme.color.hairline,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.xxl,
      ...theme.elevation.e2,
    },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 4,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.hairline,
      marginBottom: theme.spacing.base,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: theme.radius.rSm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.color.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.color.hairline,
    },
    subtitle: { marginTop: theme.spacing.xs, marginBottom: theme.spacing.base },
    options: { gap: theme.spacing.sm },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 56,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    optionText: { flex: 1, minWidth: 0, gap: 2 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
