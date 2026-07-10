/**
 * Results (DESIGN.md §6B, §7.3) — Direction A "Yuka-pure" rebuild.
 *
 * Header: the rounded back button + a back-context word, the bocado brand mark,
 * and a compact, non-naggy Pro affordance (a coral "Pro" pill that routes to the
 * Paywall — or a tiny "Pro" checkmark once the user is Pro). Context block: the
 * place name set big, a meal-context pill, a "N dishes read" pill, the
 * green/amber/red legend, and a tidy FILTER ROW (quick suitability chips + a
 * "Filters" icon-button that opens the FilterSheet for sort + Pro smart filters).
 *
 * Then a FlashList of rows EXACTLY like the approved mockup — a left verdict RING
 * (the signature motif), the dish name, a verdict-word pill + kcal range, and a
 * chevron; AI-illustrated dishes show a thumbnail with an "AI" tag and a premium
 * lock instead of the chevron.
 *
 * The legend/filter row lives INSIDE the list header, so it scrolls WITH the
 * content and never eats the list height — the full list always scrolls under it,
 * and every matching dish renders (no maxItems cap). FlashList v2 auto-measures
 * row heights, so there is no estimatedItemSize to mis-tune / truncate the list.
 *
 * Each row is a `PressableScale` (tactile press) and fades+rises on entry,
 * staggered top -> bottom so the list teaches reading order (top = best match).
 *
 * Reads the scanned menu from the on-device store (`getMenu`); suitability was
 * already finalized on-device (profile-aware) at scan time, so this screen ranks,
 * filters, and renders what it reads.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';

import type { DietId, Dish, MealContext, ScannedMenu, SuitabilityLevel } from '@bocado/shared';
import { dishFitsDiet, dishHitsAllergies } from '@bocado/nutrition';
import {
  AppText,
  EmptyState,
  FilterSheet,
  Icon,
  PressableScale,
  ProBadge,
  Screen,
  VerdictRing,
  Wordmark,
  type ResultsSort,
  type SmartFilterId,
} from '@/components';
import { useTheme } from '@/theme';
import { verdictColors, type Theme } from '@/theme/tokens';
import { motionDuration, presets, springs, staggerDelay } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEntitlement } from '@/store/entitlement';
import { useProfile } from '@/store/profile';
import { dishThumb } from '@/assets/dishImages';
import { getMenu } from '@/data/menuService';
import type { RootStackScreenProps } from '@/navigation/types';
import { BackButton } from './BackButton';

/** Best-first ordering: good before caution before avoid. */
const RANK: Record<SuitabilityLevel, number> = { good: 0, caution: 1, avoid: 2 };

/** The per-dish verdict ring is "full" for good and high-but-not-full for concerns. */
const RING_FILL: Record<SuitabilityLevel, number> = { good: 1, caution: 0.62, avoid: 0.92 };

/** Pretty, human meal-context label for the context pill. */
const CONTEXT_LABEL: Record<MealContext, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'late-night': 'Late night',
  snack: 'Snack',
};

const CONTEXT_ICON: Record<MealContext, Parameters<typeof Icon>[0]['name']> = {
  breakfast: 'Sunrise',
  lunch: 'Sun',
  dinner: 'Sunset',
  'late-night': 'Moon',
  snack: 'Cookie',
};

/** The quick suitability filter chips. `null` = "All" (no level filter). */
type SuitabilityFilter = SuitabilityLevel | null;
const FILTER_CHIPS: { id: SuitabilityFilter; label: string }[] = [
  { id: null, label: 'All' },
  { id: 'good', label: 'Good' },
  { id: 'caution', label: 'Heavy' },
  { id: 'avoid', label: 'Avoid' },
];

/** Max-kcal key for kcal-based sorts; dishes without nutrition sort last. */
function maxKcal(d: Dish): number {
  return d.nutrition?.kcal.max ?? Number.MAX_SAFE_INTEGER;
}

/** Sort comparator for the active sort mode. */
function compareForSort(sort: ResultsSort): (a: Dish, b: Dish) => number {
  if (sort === 'lightest') return (a, b) => maxKcal(a) - maxKcal(b);
  if (sort === 'heaviest') return (a, b) => maxKcal(b) - maxKcal(a);
  // 'best': verdict rank, then lighter first within the same verdict.
  return (a, b) => {
    const r = RANK[a.suitability.level] - RANK[b.suitability.level];
    return r !== 0 ? r : maxKcal(a) - maxKcal(b);
  };
}

/**
 * Build the per-dish predicate for an active Pro smart filter.
 *
 * Reuses the engine's PURE diet/allergy helpers so the filtered list never disagrees
 * with the verdict ring: a "Not vegan" dish is exactly one the vegan filter drops.
 *
 *  - vegan / vegetarian / gluten-free  -> keep dishes that fit that diet.
 *  - match-profile  -> keep dishes that fit the user's OWN diet AND don't hit any of
 *    the user's flagged allergies (the on-device profile, never sent anywhere).
 *
 * Returns `null` when there is nothing to filter (no smart filter, or a profile-less
 * "match my profile" with no diet + no allergies) so the list passes through untouched.
 */
function smartPredicate(
  smart: SmartFilterId | null,
  profileDiet: DietId,
  profileAllergies: ReturnType<typeof useProfile>['profile']['allergies'],
): ((d: Dish) => boolean) | null {
  if (!smart) return null;
  if (smart === 'match-profile') {
    const noop = profileDiet === 'none' && profileAllergies.length === 0;
    if (noop) return null;
    return (d) => dishFitsDiet(d, profileDiet) && !dishHitsAllergies(d, profileAllergies);
  }
  // Diet preset (vegan / vegetarian / gluten-free) maps 1:1 to a DietId.
  const diet = smart as DietId;
  return (d) => dishFitsDiet(d, diet);
}

export function ResultsScreen({ route, navigation }: RootStackScreenProps<'Results'>) {
  const menu = getMenu(route.params.menuId);
  const { isPro } = useEntitlement();
  const { profile } = useProfile();

  const [filter, setFilter] = useState<SuitabilityFilter>(null);
  const [sort, setSort] = useState<ResultsSort>('best');
  const [smartFilter, setSmartFilter] = useState<SmartFilterId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Sort first (so counts stay stable across filters), then apply the chip filter.
  const sorted = useMemo<Dish[]>(() => {
    if (!menu) return [];
    return [...menu.dishes].sort(compareForSort(sort));
  }, [menu, sort]);

  // Pro smart filter (diet preset / match-profile). Only applied when the user is Pro;
  // free users can never set one (the locked rows route to the paywall instead).
  const visible = useMemo<Dish[]>(() => {
    let list = filter ? sorted.filter((d) => d.suitability.level === filter) : sorted;
    if (isPro) {
      const predicate = smartPredicate(smartFilter, profile.diet, profile.allergies);
      if (predicate) list = list.filter(predicate);
    }
    return list;
  }, [sorted, filter, isPro, smartFilter, profile.diet, profile.allergies]);

  const goPaywall = () => navigation.navigate('Paywall');

  if (!menu) {
    return (
      <Screen header={<BackButton onPress={() => navigation.navigate('Scan')} label="Back to scan" visibleLabel="Scan" />}>
        <EmptyState
          variant="error"
          title="Couldn't read this clearly"
          message="The menu didn't come through. Let's take another photo."
          actionLabel="Retake"
          onAction={() => navigation.navigate('Scan')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      header={<ResultsHeader onBack={() => navigation.navigate('Scan')} isPro={isPro} onPro={goPaywall} />}
    >
      <FlashList
        data={visible}
        keyExtractor={(d) => d.id}
        contentContainerStyle={listContentStyle}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <ContextBlock
            menu={menu}
            count={menu.dishes.length}
            filter={filter}
            onChangeFilter={setFilter}
            onOpenFilters={() => setSheetOpen(true)}
          />
        }
        ListEmptyComponent={
          <NoMatches
            onClear={() => {
              setFilter(null);
              setSmartFilter(null);
            }}
          />
        }
        ListFooterComponent={visible.length > 0 ? <EstimateFootnote /> : null}
        renderItem={({ item, index }) => (
          <DishRow
            dish={item}
            index={index}
            onPress={() => navigation.navigate('DishDetail', { menuId: menu.id, dishId: item.id })}
          />
        )}
      />

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        sort={sort}
        onChangeSort={setSort}
        isPro={isPro}
        smartFilter={smartFilter}
        onChangeSmartFilter={setSmartFilter}
        onRequirePro={() => {
          setSheetOpen(false);
          goPaywall();
        }}
      />
    </Screen>
  );
}

const listContentStyle = { paddingBottom: 24 };

// ---------------------------------------------------------------------------
// Header: rounded back button + brand mark + a compact Pro affordance (A's `.topbar`).
// ---------------------------------------------------------------------------
function ResultsHeader({ onBack, isPro, onPro }: { onBack: () => void; isPro: boolean; onPro: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.topbar}>
      <BackButton onPress={onBack} label="Back to scan" visibleLabel="Scan" />
      <View style={styles.grow} />
      <Wordmark size={16} />
      {isPro ? (
        // Already Pro: a tiny, calm "Pro ✓" status — no upsell.
        <View
          style={[styles.proStatus, { backgroundColor: theme.color.primarySoft }]}
          accessible
          accessibilityRole="text"
          accessibilityLabel="Pro active"
        >
          <Icon name="Check" size={12} color={theme.color.primary} />
          <AppText variant="caption" color="primary" style={styles.proStatusText}>
            Pro
          </AppText>
        </View>
      ) : (
        // Free: a small, non-naggy Pro pill that routes to the paywall on tap.
        <PressableScale
          onPress={onPro}
          accessibilityRole="button"
          accessibilityLabel="Get Bocado Pro"
        >
          <ProBadge variant="pill" />
        </PressableScale>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Context block: place name, meal-context + count pills, legend, filter row.
// ---------------------------------------------------------------------------
function ContextBlock({
  menu,
  count,
  filter,
  onChangeFilter,
  onOpenFilters,
}: {
  menu: ScannedMenu;
  count: number;
  filter: SuitabilityFilter;
  onChangeFilter: (f: SuitabilityFilter) => void;
  onOpenFilters: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.ctx}>
      <AppText variant="display" style={styles.place}>
        {menu.title ?? 'Your menu'}
      </AppText>

      <View style={styles.meta}>
        <View style={[styles.pill, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}>
          <Icon name={CONTEXT_ICON[menu.context]} size={13} color={theme.color.text} />
          <AppText variant="caption" style={styles.pillText}>
            {CONTEXT_LABEL[menu.context]}
          </AppText>
        </View>
        <View style={[styles.pill, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}>
          <AppText variant="caption" color="textSoft">
            {count} {count === 1 ? 'dish' : 'dishes'} read
          </AppText>
        </View>
      </View>

      <View style={[styles.legend, { borderTopColor: theme.color.hairline }]}>
        <LegendItem color={theme.color.good} label="Good now" />
        <LegendItem color={theme.color.caution} label="Heavy" />
        <LegendItem color={theme.color.avoid} label="Avoid now" />
      </View>

      <View style={styles.filterRow}>
        <View style={styles.chips}>
          {FILTER_CHIPS.map((c) => (
            <FilterChip
              key={c.label}
              label={c.label}
              selected={filter === c.id}
              onPress={() => onChangeFilter(c.id)}
            />
          ))}
        </View>
        <PressableScale
          onPress={onOpenFilters}
          accessibilityRole="button"
          accessibilityLabel="Open filters and sort"
          style={[styles.filterBtn, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}
        >
          <Icon name="SlidersHorizontal" size={17} color={theme.color.text} />
        </PressableScale>
      </View>
    </View>
  );
}

/** A quick suitability filter chip — canonical selection pattern (tint + selectedText). */
function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Spring on select — settle the chip with a crisp, no-overshoot spring.
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(selected ? 1.04 : 1, springs.selectSpring);
  }, [selected, reduceMotion, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Show ${label}`}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? theme.color.selectedTint : theme.color.surfaceRaised,
            borderColor: selected ? 'transparent' : theme.color.hairline,
          },
        ]}
      >
        <AppText
          variant="label"
          style={[styles.chipText, { color: selected ? theme.color.selectedText : theme.color.textSoft }]}
        >
          {label}
        </AppText>
      </PressableScale>
    </Animated.View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <AppText variant="caption" color="textFaint">
        {label}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty result of an active filter (no dishes at this level).
// ---------------------------------------------------------------------------
function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      variant="empty"
      title="No dishes here"
      message="Nothing matched this filter. Try another, or show everything."
      actionLabel="Show all"
      onAction={onClear}
    />
  );
}

// ---------------------------------------------------------------------------
// Dish row — A's `.row`: verdict ring · name + verdict-word pill + kcal · chevron,
// or an AI thumbnail with an "AI" tag + premium lock.
// ---------------------------------------------------------------------------
function DishRow({ dish, index, onPress }: { dish: Dish; index: number; onPress: () => void }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const colors = verdictColors(theme, dish.suitability.level);

  const kcal = dish.nutrition?.kcal;
  const kcalText = kcal ? `${kcal.min}–${kcal.max} kcal` : null;

  // Entrance: fade + rise, staggered by index (top = best match).
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 10);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
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

  const a11y = [dish.suitability.label, dish.translatedName, kcalText ?? undefined]
    .filter(Boolean)
    .join(', ');

  return (
    <Animated.View style={animatedStyle}>
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={[styles.row, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}
      >
        <VerdictRing
          level={dish.suitability.level}
          variant="list"
          fillPct={RING_FILL[dish.suitability.level]}
          delayMs={staggerDelay(index, reduceMotion)}
        />

        <View style={styles.rowText}>
          <AppText variant="title" numberOfLines={2} style={styles.rowName}>
            {dish.translatedName}
          </AppText>
          <View style={styles.rowSub}>
            <View style={[styles.verdictWord, { backgroundColor: colors.soft }]}>
              <View style={[styles.verdictDot, { backgroundColor: colors.solid }]} />
              <AppText variant="caption" style={[styles.verdictWordText, { color: colors.text }]}>
                {dish.suitability.label}
              </AppText>
            </View>
            {kcalText ? (
              <AppText variant="caption" color="textFaint" numberOfLines={1}>
                {dish.suitability.uncertain ? `${kcalText} · rough` : kcalText}
              </AppText>
            ) : null}
          </View>
        </View>

        <DishThumb dish={dish} index={index} />
      </PressableScale>
    </Animated.View>
  );
}

/**
 * Per-dish thumbnail. Every dish shows an AI dish illustration:
 *   FREE → a BLURRED placeholder + a lock (the upsell tease — you can tell it's a
 *          dish, not exactly what it is). Costs nothing (bundled placeholder set).
 *   PRO  → the SHARP image.
 * Both keep the "AI" label (EU AI Act). Real product swaps these for per-dish
 * images generated lazily on the Worker and cached globally (see ARCHITECTURE.md).
 */
function DishThumb({ dish, index }: { dish: Dish; index: number }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isPro } = useEntitlement();
  const thumb = dishThumb(dish.translatedName, index, isPro);
  return (
    <View
      style={[styles.thumb, { borderColor: theme.color.hairline }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        isPro
          ? `AI illustration of ${dish.translatedName}`
          : `AI illustration of ${dish.translatedName}, locked — Pro`
      }
    >
      <Image source={thumb.source} style={styles.thumbFill} contentFit="cover" />
      {!isPro ? (
        <View style={[styles.thumbLock, { backgroundColor: 'rgba(27,25,22,0.55)' }]}>
          <Icon name="Lock" size={9} color={theme.color.onPrimary} />
        </View>
      ) : null}
      <View style={styles.thumbTag}>
        <AppText variant="caption" style={styles.thumbTagText}>
          AI
        </AppText>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Estimate footnote (A's `.estimate-foot`).
// ---------------------------------------------------------------------------
function EstimateFootnote() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.footnote}>
      <Icon name="Info" size={14} color={theme.color.textFaint} />
      <AppText variant="caption" color="textFaint" style={styles.footnoteText}>
        Calories and nutrients are estimates from the menu, shown as ranges. Always confirm details with the restaurant.
      </AppText>
    </View>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
    },
    grow: { flex: 1 },
    proStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
    },
    proStatusText: {
      fontSize: 11,
      letterSpacing: 0.4,
    },
    ctx: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.base,
    },
    place: {
      fontSize: 27,
      lineHeight: 30,
    },
    meta: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      flexWrap: 'wrap',
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    pillText: {
      color: theme.color.text,
    },
    legend: {
      marginTop: theme.spacing.base,
      paddingTop: theme.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.base,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    legendDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    filterRow: {
      marginTop: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    chips: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      flexWrap: 'wrap',
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
    },
    chipText: {
      fontSize: 13,
    },
    filterBtn: {
      width: 38,
      height: 38,
      borderRadius: theme.radius.rSm,
      borderWidth: StyleSheet.hairlineWidth,
      alignItems: 'center',
      justifyContent: 'center',
      ...theme.elevation.e1,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
      marginHorizontal: theme.spacing.base,
      marginBottom: 10,
      paddingVertical: 15,
      paddingHorizontal: theme.spacing.base,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
      ...theme.elevation.e1,
    },
    rowText: {
      flex: 1,
      minWidth: 0,
    },
    rowName: {
      fontSize: 15,
      lineHeight: 19,
    },
    rowSub: {
      marginTop: 5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      flexWrap: 'wrap',
    },
    verdictWord: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingLeft: 7,
      paddingRight: 9,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
    },
    verdictDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    verdictWordText: {
      fontSize: 11.5,
      lineHeight: 15,
    },
    thumb: {
      width: 52,
      height: 52,
      borderRadius: theme.radius.rSm,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    thumbFill: {
      ...StyleSheet.absoluteFillObject,
    },
    thumbLock: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 16,
      height: 16,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbTag: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 2,
      backgroundColor: 'rgba(27,25,22,0.62)',
    },
    thumbTagText: {
      color: theme.color.onPrimary,
      fontSize: 8,
      lineHeight: 11,
      letterSpacing: 0.5,
    },
    footnote: {
      marginHorizontal: theme.spacing.base,
      marginTop: 2,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: 14,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 9,
    },
    footnoteText: {
      flex: 1,
    },
  });
}
