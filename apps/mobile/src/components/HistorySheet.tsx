/**
 * HistorySheet — the "recent menus" bottom sheet (no new dependency).
 *
 * A small, opt-in entry point into previously-scanned menus. It mirrors the
 * FilterSheet's overlay pattern (scrim + bottom panel, theme-aware warm cream, motion
 * gated through `motionDuration` for reduced-motion) and is built only from existing
 * primitives — AppText, Icon, PressableScale, EmptyState.
 *
 * It loads recents on open via the data layer (`listRecentMenus`), which reads the
 * device's server-side history when a backend is configured and the in-memory local
 * recents otherwise. Tapping a row asks the host to open that menu (the host resolves
 * the full menu into the cache before navigating). No personal data is shown or sent —
 * a menu summary is anonymous (title, time, dish count).
 */
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { MealContext } from '@bocado/shared';
import { AppText } from './AppText';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from '@/theme/useTheme';
import { verdictColors, type Theme } from '@/theme/tokens';
import { motionDuration, presets, springs } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { listRecentMenus, type MenuSummary } from '@/data/menuService';
import { useSavedDishes, type SavedDishRef } from '@/store/savedDishes';

const CONTEXT_LABEL: Record<MealContext, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'late-night': 'Late night',
  snack: 'Snack',
};

export interface HistorySheetProps {
  /** Whether the sheet is mounted/visible. */
  open: boolean;
  /** Dismiss the sheet (scrim tap, close button, or hardware back). */
  onClose: () => void;
  /** Open a menu from history; the host resolves + caches it, then navigates. */
  onOpenMenu: (menuId: string) => void;
  /**
   * Open a saved dish (host resolves its menu into the cache, then navigates to the
   * dish). Optional — the Saved section only renders its open behaviour when provided.
   */
  onOpenDish?: (menuId: string, dishId: string) => void;
  /** Delete one menu from history (GDPR Art. 17). Optional — no delete control without it. */
  onDeleteMenu?: (menuId: string) => void;
  /** Clear the entire scan history (GDPR Art. 17). Optional — no "Clear all" without it. */
  onClearHistory?: () => void;
}

export function HistorySheet({
  open,
  onClose,
  onOpenMenu,
  onOpenDish,
  onDeleteMenu,
  onClearHistory,
}: HistorySheetProps): React.JSX.Element {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = makeStyles(theme);
  const { saved, remove } = useSavedDishes();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MenuSummary[]>([]);

  // Load recents each time the sheet opens, so a menu scanned since last open appears.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    void listRecentMenus()
      .then((recents) => {
        if (active) setItems(recents);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

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

  /** Delete one menu behind a destructive confirm, removing it from the list optimistically. */
  const confirmDeleteMenu = (item: MenuSummary): void => {
    if (!onDeleteMenu) return;
    const title = item.title ?? 'Your menu';
    Alert.alert('Delete this menu?', `“${title}” will be removed from your history.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setItems((prev) => prev.filter((m) => m.id !== item.id));
          onDeleteMenu(item.id);
        },
      },
    ]);
  };

  /** Clear ALL history behind a destructive confirm, emptying the list optimistically. */
  const confirmClearAll = (): void => {
    if (!onClearHistory) return;
    Alert.alert('Clear all history?', 'Every scanned menu will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => {
          setItems([]);
          onClearHistory();
        },
      },
    ]);
  };

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close recent menus"
          />
        </Animated.View>

        <Animated.View style={[styles.panel, panelStyle]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.headerRow}>
            <AppText variant="title">Recent menus</AppText>
            <View style={styles.headerActions}>
              {onClearHistory && items.length > 0 ? (
                <PressableScale
                  onPress={confirmClearAll}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all history"
                  style={styles.clearAllBtn}
                >
                  <AppText variant="caption" color="textSoft">
                    Clear all
                  </AppText>
                </PressableScale>
              ) : null}
              <PressableScale
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close recent menus"
                style={styles.closeBtn}
              >
                <Icon name="X" size={18} color={theme.color.textSoft} />
              </PressableScale>
            </View>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Saved dishes — a compact bookmarks shelf above the recents. Hidden when
                empty so it never adds chrome for users who haven't saved anything. */}
            {saved.length > 0 ? (
              <View style={styles.section}>
                <AppText variant="caption" color="textFaint" style={styles.sectionKicker}>
                  SAVED
                </AppText>
                {saved.map((s) => (
                  <SavedRow
                    key={`${s.menuId}:${s.dishId}`}
                    item={s}
                    onPress={onOpenDish ? () => onOpenDish(s.menuId, s.dishId) : undefined}
                    onRemove={() => remove(s.menuId, s.dishId)}
                  />
                ))}
              </View>
            ) : null}

            {loading ? (
              <AppText variant="caption" color="textSoft" style={styles.status}>
                Loading…
              </AppText>
            ) : items.length === 0 ? (
              saved.length === 0 ? (
                <View style={styles.empty}>
                  <EmptyState
                    variant="empty"
                    title="No menus yet"
                    message="Menus you scan will show up here so you can revisit them."
                  />
                </View>
              ) : null
            ) : (
              <View style={styles.section}>
                {saved.length > 0 ? (
                  <AppText variant="caption" color="textFaint" style={styles.sectionKicker}>
                    RECENT
                  </AppText>
                ) : null}
                {items.map((m) => (
                  <HistoryRow
                    key={m.id}
                    item={m}
                    onPress={() => onOpenMenu(m.id)}
                    onDelete={onDeleteMenu ? () => confirmDeleteMenu(m) : undefined}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function HistoryRow({
  item,
  onPress,
  onDelete,
}: {
  item: MenuSummary;
  onPress: () => void;
  onDelete?: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const title = item.title ?? 'Your menu';
  const meta = `${CONTEXT_LABEL[item.context]} · ${item.dishCount} ${item.dishCount === 1 ? 'dish' : 'dishes'}`;
  return (
    <View style={styles.rowWrap}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${meta}`}
        style={[styles.row, styles.rowGrow, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
      >
        <View style={styles.rowText}>
          <AppText variant="label" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color="textFaint" numberOfLines={1}>
            {meta}
          </AppText>
        </View>
        <Icon name="ChevronRight" size={16} color={theme.color.textFaint} />
      </PressableScale>
      {onDelete ? (
        <PressableScale
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${title}`}
          style={[styles.trailingBtn, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
        >
          <Icon name="Trash2" size={16} color={theme.color.textSoft} />
        </PressableScale>
      ) : null}
    </View>
  );
}

/** A saved-dish row: a verdict dot + the dish name, with a trailing remove control. */
function SavedRow({
  item,
  onPress,
  onRemove,
}: {
  item: SavedDishRef;
  onPress?: () => void;
  onRemove: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const dotColor = verdictColors(theme, item.level).solid;
  return (
    <View style={styles.rowWrap}>
      <PressableScale
        onPress={onPress ?? (() => undefined)}
        accessibilityRole="button"
        accessibilityLabel={`Saved dish ${item.translatedName}`}
        style={[styles.row, styles.rowGrow, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
      >
        <View style={[styles.savedDot, { backgroundColor: dotColor }]} />
        <View style={styles.rowText}>
          <AppText variant="label" numberOfLines={1}>
            {item.translatedName}
          </AppText>
        </View>
        {onPress ? <Icon name="ChevronRight" size={16} color={theme.color.textFaint} /> : null}
      </PressableScale>
      <PressableScale
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.translatedName} from saved`}
        style={[styles.trailingBtn, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
      >
        <Icon name="X" size={16} color={theme.color.textSoft} />
      </PressableScale>
    </View>
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
      maxHeight: '70%',
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    clearAllBtn: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.rSm,
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
    status: { paddingVertical: theme.spacing.lg, textAlign: 'center' },
    empty: { paddingVertical: theme.spacing.md },
    list: { flexGrow: 0 },
    listContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
    section: { gap: theme.spacing.sm },
    sectionKicker: {
      letterSpacing: 1,
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.xs,
    },
    rowWrap: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: theme.spacing.sm,
    },
    rowGrow: { flex: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 56,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    rowText: { flex: 1, minWidth: 0, gap: 2 },
    savedDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    trailingBtn: {
      width: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
  });
}
