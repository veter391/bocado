/**
 * FilterSheet — the Results "Filters" bottom sheet (no new dependency).
 *
 * An absolute, theme-aware overlay sheet that slides up from the bottom over the
 * Results screen. It is opened by the SlidersHorizontal icon-button at the end of
 * the filter row and carries the controls that don't belong inline:
 *
 *   - Sort:  Best first / Lightest first / Heaviest first (always available).
 *   - Smart filters (Pro):  diet presets (vegan / vegetarian / gluten-free) and
 *     "match my profile", shown as Pro-LOCKED rows. Tapping one when the user is
 *     not Pro routes to the Paywall (via `onRequirePro`); we never silently no-op.
 *
 * It is built from the existing primitives only — AppText, Icon, PressableScale,
 * ProBadge — and reads colors EXCLUSIVELY from `theme.color.*` (no hardcoded
 * white; cards/sheets use the warm-cream `surfaceRaised`/`surface` tokens).
 *
 * Motion: the sheet panel rises (translateY) and the scrim fades in, driven on
 * the Reanimated UI thread and gated through `motionDuration(...)` so reduced
 * motion collapses both to instant (no slide, no fade-delay). Selected rows use
 * the canonical selection pattern — `selectedTint` background + `selectedText`
 * label + a filled coral check — and settle with `springs.selectSpring`.
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

import { AppText } from './AppText';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { ProBadge } from './ProBadge';
import { useTheme } from '@/theme/useTheme';
import type { Theme } from '@/theme/tokens';
import { motionDuration, presets, springs } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** How the list is ordered. Mirrors the Results ranking options. */
export type ResultsSort = 'best' | 'lightest' | 'heaviest';

/** A Pro-only "smart filter". These are surfaced as locked rows for free users. */
export type SmartFilterId = 'vegan' | 'vegetarian' | 'gluten-free' | 'match-profile';

const SORT_OPTIONS: { id: ResultsSort; label: string }[] = [
  { id: 'best', label: 'Best first' },
  { id: 'lightest', label: 'Lightest first' },
  { id: 'heaviest', label: 'Heaviest first' },
];

const SMART_FILTERS: { id: SmartFilterId; label: string }[] = [
  { id: 'vegan', label: 'Vegan only' },
  { id: 'vegetarian', label: 'Vegetarian only' },
  { id: 'gluten-free', label: 'Gluten-free only' },
  { id: 'match-profile', label: 'Match my profile' },
];

export interface FilterSheetProps {
  /** Whether the sheet is mounted/visible. */
  open: boolean;
  /** Dismiss the sheet (scrim tap, close button, or hardware back). */
  onClose: () => void;
  /** Current sort selection. */
  sort: ResultsSort;
  /** Change the sort. */
  onChangeSort: (sort: ResultsSort) => void;
  /** True when the user has Pro — unlocks the smart-filter group. */
  isPro: boolean;
  /**
   * The active Pro smart filter, or `null` for none. Only meaningful when `isPro`
   * (free users can never set one — tapping a locked row routes to the paywall).
   */
  smartFilter: SmartFilterId | null;
  /**
   * Toggle a Pro smart filter (Pro users only). Passing the active id clears it.
   * Ignored for free users — they hit `onRequirePro` instead.
   */
  onChangeSmartFilter: (id: SmartFilterId | null) => void;
  /**
   * Called when a free user taps a Pro-locked smart filter — the host routes to
   * the Paywall. (When `isPro`, the host applies the filter via `onChangeSmartFilter`.)
   */
  onRequirePro: () => void;
}

export function FilterSheet({
  open,
  onClose,
  sort,
  onChangeSort,
  isPro,
  smartFilter,
  onChangeSmartFilter,
  onRequirePro,
}: FilterSheetProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);

  // Scrim opacity (0 -> 1) and panel offset (down -> 0). Driven on the UI thread.
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
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* Scrim — tap to dismiss. */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close filters"
          />
        </Animated.View>

        {/* Panel — warm-cream sheet anchored to the bottom. */}
        <Animated.View
          style={[styles.panel, panelStyle]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <AppText variant="title">Filters</AppText>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close filters"
              style={styles.closeBtn}
            >
              <Icon name="X" size={18} color={theme.color.textSoft} />
            </PressableScale>
          </View>

          {/* --- Sort ---------------------------------------------------------- */}
          <AppText variant="label" color="textSoft" style={styles.groupLabel}>
            Sort
          </AppText>
          <View style={styles.group}>
            {SORT_OPTIONS.map((opt) => (
              <SortRow
                key={opt.id}
                label={opt.label}
                selected={sort === opt.id}
                onPress={() => onChangeSort(opt.id)}
              />
            ))}
          </View>

          {/* --- Smart filters (Pro) ----------------------------------------- */}
          <View style={styles.smartHeader}>
            <AppText variant="label" color="textSoft" style={styles.groupLabel}>
              Smart filters
            </AppText>
            {!isPro ? <ProBadge variant="pill" /> : null}
          </View>
          <View style={styles.group}>
            {SMART_FILTERS.map((f) => (
              <SmartRow
                key={f.id}
                label={f.label}
                isPro={isPro}
                selected={isPro && smartFilter === f.id}
                onPress={
                  isPro
                    ? () => onChangeSmartFilter(smartFilter === f.id ? null : f.id)
                    : onRequirePro
                }
              />
            ))}
          </View>

          {!isPro ? (
            <AppText variant="caption" color="textFaint" style={styles.proHint}>
              Smart filters tailor the list to your diet and profile — included with Pro.
            </AppText>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sort row — the canonical selection pattern (tint bg + selectedText + check).
// ---------------------------------------------------------------------------
function SortRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);

  const checkScale = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      checkScale.value = selected ? 1 : 0;
      return;
    }
    checkScale.value = withSpring(selected ? 1 : 0, springs.selectSpring);
  }, [selected, reduceMotion, checkScale]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.optionRow,
        {
          backgroundColor: selected ? theme.color.selectedTint : theme.color.surface,
          borderColor: selected ? 'transparent' : theme.color.hairline,
        },
      ]}
    >
      <AppText
        variant="label"
        style={{ color: selected ? theme.color.selectedText : theme.color.text }}
      >
        {label}
      </AppText>
      <Animated.View
        style={[styles.check, { backgroundColor: theme.color.primary }, checkStyle]}
      >
        <Icon name="Check" size={13} color={theme.color.onPrimary} />
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Smart-filter row — Pro-locked. Lock glyph + label; tap routes to Paywall when
// the user isn't Pro. Never selectable for free users (so no light-on-light).
// ---------------------------------------------------------------------------
function SmartRow({
  label,
  isPro,
  selected,
  onPress,
}: {
  label: string;
  isPro: boolean;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);
  const locked = !isPro;

  // Selected check (Pro only) — the canonical selection pattern, mirroring SortRow.
  const checkScale = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      checkScale.value = selected ? 1 : 0;
      return;
    }
    checkScale.value = withSpring(selected ? 1 : 0, springs.selectSpring);
  }, [selected, reduceMotion, checkScale]);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        locked ? `${label}, Pro feature` : selected ? `${label}, selected` : label
      }
      style={[
        styles.optionRow,
        {
          backgroundColor: selected ? theme.color.selectedTint : theme.color.surface,
          borderColor: selected ? 'transparent' : theme.color.hairline,
        },
      ]}
    >
      <View style={styles.smartLabel}>
        {locked ? (
          <View style={[styles.lockChip, { backgroundColor: theme.color.primarySoft }]}>
            <Icon name="Lock" size={12} color={theme.color.primary} />
          </View>
        ) : (
          <Icon
            name="Sparkles"
            size={16}
            color={selected ? theme.color.selectedText : theme.color.primary}
          />
        )}
        <AppText
          variant="label"
          style={{
            color: locked
              ? theme.color.textSoft
              : selected
                ? theme.color.selectedText
                : theme.color.text,
          }}
          numberOfLines={1}
        >
          {label}
        </AppText>
      </View>
      {locked ? (
        <Icon name="ChevronRight" size={16} color={theme.color.textFaint} />
      ) : (
        <Animated.View
          style={[styles.check, { backgroundColor: theme.color.primary }, checkStyle]}
        >
          <Icon name="Check" size={13} color={theme.color.onPrimary} />
        </Animated.View>
      )}
    </PressableScale>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    scrim: {
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
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
      marginBottom: theme.spacing.base,
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
    groupLabel: {
      marginBottom: theme.spacing.sm,
      letterSpacing: 0.3,
    },
    group: {
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.lg,
    },
    smartHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 50,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smartLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      flexShrink: 1,
    },
    lockChip: {
      width: 26,
      height: 26,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    proHint: {
      marginTop: -theme.spacing.sm,
    },
  });
}
