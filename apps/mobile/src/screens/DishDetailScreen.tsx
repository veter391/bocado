/**
 * Dish detail (DESIGN.md §6C) — Direction A "Yuka-pure" rebuild.
 *
 * Header: rounded back button (place name as back-context) + a rounded save
 * button. Hero: the big verdict RING with the level icon, the verdict word + sub,
 * then the kcal range and "per portion · estimate". Then, in order:
 *   - a "what it is" card (the plain explanation),
 *   - the "Nutrient lights" section — the centerpiece — driven by
 *     `rateNutrients(dish.nutrition)`,
 *   - a "Likely ingredients" card,
 *   - a "May contain" allergen card (never "safe"),
 *   - a premium hint banner (lock + "Unlock AI dish photos & smart filters · Pro"),
 *   - an estimate footnote,
 * and a pinned coral CTA "See lighter options".
 *
 * Motion: the hero (ring + title) fades+rises on entry (cardToDetail continuation).
 * The ring's sweep, the nutrient bars' grow, and the allergen pulse are owned by
 * their own components. All gated for reduced motion.
 */
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInUp } from 'react-native-reanimated';
import { Image } from 'expo-image';

import { rateNutrients } from '@bocado/nutrition';
import { ALLERGENS, ALLERGEN_DISCLAIMER, matchName } from '@bocado/shared';
import type { SuitabilityLevel } from '@bocado/shared';
import {
  AppText,
  Icon,
  IconButton,
  NutrientLights,
  PressableScale,
  ProBadge,
  Screen,
  VerdictRing,
} from '@/components';
import { motion, useTheme } from '@/theme';
import { type Theme } from '@/theme/tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEntitlement } from '@/store/entitlement';
import { useSavedDishes } from '@/store/savedDishes';
import { getDish, getMenu } from '@/data/menuService';
import { dishThumb } from '@/assets/dishImages';
import type { RootStackScreenProps } from '@/navigation/types';
import { BackButton } from './BackButton';

/** Hero ring fill per verdict (matches the list ring + A's hero). */
const RING_FILL: Record<SuitabilityLevel, number> = { good: 1, caution: 0.62, avoid: 0.92 };

/** Hero word + sub-line per verdict. */
const HERO_WORD: Record<SuitabilityLevel, string> = { good: 'Good', caution: 'Caution', avoid: 'Avoid' };

export function DishDetailScreen({ route, navigation }: RootStackScreenProps<'DishDetail'>) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { isPro } = useEntitlement();
  const { isSaved, toggle, hydrated: savedHydrated } = useSavedDishes();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { menuId } = route.params;
  const dish = getDish(menuId, route.params.dishId);

  if (!dish) {
    return (
      <Screen header={<BackButton onPress={() => navigation.goBack()} label="Back to the menu" visibleLabel="Menu" />}>
        <View style={styles.missing}>
          <AppText variant="title">Dish not found</AppText>
          <AppText variant="body" color="textSoft" style={{ marginTop: theme.spacing.sm }}>
            We couldn't open this dish. Go back and pick another.
          </AppText>
        </View>
      </Screen>
    );
  }

  const { nutrition } = dish;
  const lights = nutrition ? rateNutrients(nutrition) : [];
  const kcal = nutrition?.kcal;

  // Big dish image (what the user most wants to see). FREE = blurred + "See with Pro";
  // PRO = sharp. Index matches the list thumbnail for visual continuity.
  const menu = getMenu(route.params.menuId);
  const dishIndex = menu ? menu.dishes.findIndex((d) => d.id === dish.id) : 0;
  const heroImg = dishThumb(dish.translatedName, dishIndex < 0 ? 0 : dishIndex, isPro);
  const goPaywall = () => navigation.navigate('Paywall');

  // On-device bookmark. The filled glyph + coral colour AND the changed glyph/label
  // carry the saved state (colour is never the only signal — DESIGN.md §8 / Icon.tsx).
  // No-op until the saved store has hydrated, so a tap can't race the stored list.
  const saved = isSaved(menuId, dish.id);
  const onToggleSave = () => {
    if (!savedHydrated) return;
    toggle({
      menuId,
      dishId: dish.id,
      translatedName: dish.translatedName,
      level: dish.suitability.level,
      savedAt: new Date().toISOString(),
    });
  };

  const enterEasing = Easing.bezier(
    motion.easing.out[0],
    motion.easing.out[1],
    motion.easing.out[2],
    motion.easing.out[3],
  );
  const headerEnter = FadeInUp.duration(
    motion.motionDuration(motion.presets.cardToDetail.d, reduceMotion),
  ).easing(enterEasing);

  return (
    <Screen
      scroll
      padded={false}
      header={
        <View style={styles.topbar}>
          <BackButton onPress={() => navigation.goBack()} label="Back to the menu" visibleLabel="Menu" />
          <View style={styles.grow} />
          <IconButton
            icon={saved ? 'BookmarkCheck' : 'Bookmark'}
            onPress={onToggleSave}
            accessibilityLabel={saved ? 'Saved — tap to remove' : 'Save dish'}
            color={saved ? theme.color.primary : theme.color.text}
            iconSize={18}
          />
        </View>
      }
      footer={
        <View style={[styles.foot, { backgroundColor: theme.color.background }]}>
          <PressableScale
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="See lighter options"
            style={[styles.cta, { backgroundColor: theme.color.primary }]}
          >
            <Icon name="Plus" size={18} color={theme.color.onPrimary} />
            <AppText variant="label" color="onPrimary" style={styles.ctaText}>
              See lighter options
            </AppText>
          </PressableScale>
        </View>
      }
    >
      <Animated.View entering={headerEnter} style={styles.hero}>
        {dish.originalText !== dish.translatedName && (
          <AppText variant="caption" color="textFaint" style={styles.orig}>
            {dish.originalText}
          </AppText>
        )}
        <AppText variant="display" style={styles.title}>
          {dish.translatedName}
        </AppText>

        <View style={styles.heroImageWrap}>
          <Image
            source={heroImg.source}
            style={styles.heroImage}
            contentFit="cover"
            transition={motion.motionDuration(motion.presets.skeletonCrossfade.d, reduceMotion)}
            accessibilityIgnoresInvertColors
          />
          <View style={styles.heroAiTag}>
            <AppText variant="caption" color="onPrimary" style={styles.heroAiTagText}>
              AI illustration
            </AppText>
          </View>
          {!isPro ? (
            <PressableScale
              onPress={goPaywall}
              accessibilityRole="button"
              accessibilityLabel="See this dish photo with Pro"
              style={styles.heroLockOverlay}
            >
              <View style={styles.heroLockChip}>
                <Icon name="Lock" size={16} color={theme.color.onPrimary} />
              </View>
              <AppText variant="label" color="onPrimary">
                See this dish with Pro
              </AppText>
            </PressableScale>
          ) : null}
        </View>

        <View style={styles.ringWrap}>
          <VerdictHero level={dish.suitability.level} label={dish.suitability.label} />
          {kcal ? (
            <View style={styles.heroKcal}>
              <AppText variant="data">
                {kcal.min}–{kcal.max} kcal
              </AppText>
              <AppText variant="caption" color="textFaint" style={styles.heroKcalLbl}>
                PER PORTION · ESTIMATE
              </AppText>
            </View>
          ) : null}
        </View>
      </Animated.View>

      {/* what it is */}
      {dish.explanation && (
        <View style={[styles.whatItIs, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}>
          <View style={[styles.whatQ, { backgroundColor: theme.color.primarySoft }]}>
            <AppText variant="title" style={[styles.whatQText, { color: theme.color.primary }]}>
              ?
            </AppText>
          </View>
          <AppText variant="body" color="textSoft" style={styles.whatText}>
            {dish.explanation}
          </AppText>
        </View>
      )}

      {/* Nutrient lights — the centerpiece */}
      {lights.length > 0 && (
        <>
          <SectionHead title="Nutrient lights" hint="per portion" />
          <View style={styles.gutter}>
            <NutrientLights lights={lights} />
          </View>
        </>
      )}

      {/* ingredients */}
      {dish.ingredients.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}>
          <AppText variant="caption" color="textFaint" style={styles.cardKicker}>
            LIKELY INGREDIENTS
          </AppText>
          <View style={styles.ingList}>
            {dish.ingredients.map((ing, idx) => {
              // Show the verbatim menu word when the model preserved it (originalTerm),
              // else the canonical/legacy name via the shared accessor. Never read .name
              // directly (back-compat shim lives in matchName).
              const label = ing.originalTerm ?? matchName(ing);
              return (
              <View key={`${label}-${idx}`} style={styles.ingItem}>
                <View style={[styles.ingNub, { backgroundColor: theme.color.primary }]} />
                <AppText variant="label" numberOfLines={1} style={styles.ingName}>
                  {label}
                </AppText>
                <AppText variant="caption" color="textFaint">
                  ~{ing.grams} g
                </AppText>
              </View>
              );
            })}
          </View>
        </View>
      )}

      {/* allergens — never "safe" */}
      {dish.allergenFlags.length > 0 && (
        <View style={[styles.allergen, { backgroundColor: theme.color.cautionSoft, borderColor: theme.color.caution }]}>
          <AppText variant="caption" style={[styles.cardKicker, { color: theme.color.cautionText }]}>
            MAY CONTAIN
          </AppText>
          <View style={styles.chips}>
            {dish.allergenFlags.map((flag) => (
              <View key={flag.allergen} style={[styles.chip, { borderColor: theme.color.caution }]}>
                <AppText variant="caption" style={[styles.chipText, { color: theme.color.cautionText }]}>
                  {allergenLabel(flag.allergen)}
                </AppText>
              </View>
            ))}
          </View>
          <View style={styles.confirm}>
            <Icon name="TriangleAlert" size={13} color={theme.color.cautionText} />
            <AppText variant="caption" style={[styles.confirmText, { color: theme.color.cautionText }]}>
              {ALLERGEN_DISCLAIMER}
            </AppText>
          </View>
        </View>
      )}

      {/* premium hint — only for FREE users. When Pro, AI features are unlocked
          (no lock, no banner); tapping it opens the Paywall. */}
      {!isPro && (
        <PressableScale
          onPress={() => navigation.navigate('Paywall')}
          accessibilityRole="button"
          accessibilityLabel="Unlock AI dish photos and smart filters with Pro"
          style={styles.premium}
        >
          <ProBadge variant="lock" />
          <View style={styles.premiumText}>
            <AppText variant="label" style={styles.premiumTitle}>
              Lighter swaps for late night
            </AppText>
            <AppText variant="caption" style={styles.premiumSub}>
              Unlock AI dish photos & smart filters
            </AppText>
          </View>
          <AppText variant="label" style={[styles.premiumGo, { color: theme.color.primary }]}>
            Pro
          </AppText>
        </PressableScale>
      )}

      {/* estimate note — surfaces honest uncertainty where the disclaimer already lives.
          When the estimate is uncertain we lead with the plain-language reason instead
          of the generic caption (no layout change, same Icon + caption container). */}
      <View style={styles.estimateNote}>
        <Icon name="Info" size={13} color={theme.color.textFaint} />
        <AppText variant="caption" color="textFaint" style={styles.estimateNoteText}>
          {dish.suitability.uncertain
            ? (dish.suitability.uncertaintyReason ??
              'Rough estimate — we could not read this dish clearly.')
            : 'Lights are estimates for one portion, not medical advice.'}
        </AppText>
      </View>
    </Screen>
  );
}

/** Hero verdict ring + word/sub, choosing a friendly sub-line from the level. */
function VerdictHero({ level, label }: { level: SuitabilityLevel; label: string }) {
  // The dish's own label (e.g. "Heavy late", "Good for dinner") is the richest
  // sub-line; the big word is the calm one-word verdict.
  return (
    <VerdictRing
      level={level}
      variant="hero"
      fillPct={RING_FILL[level]}
      word={HERO_WORD[level]}
      subWord={label}
    />
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.sectionHead}>
      <AppText variant="title" style={styles.sectionTitle}>
        {title}
      </AppText>
      {hint ? (
        <AppText variant="caption" color="textFaint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function allergenLabel(id: string): string {
  const match = ALLERGENS.find((a) => a.id === id);
  // Use the short head word (before any parenthetical) for the chip.
  const label = match ? match.label : id;
  const head = label.split('(')[0]?.trim();
  return head && head.length > 0 ? head : label;
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
    hero: {
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
    },
    orig: {
      fontStyle: 'italic',
    },
    title: {
      fontSize: 26,
      lineHeight: 30,
      textAlign: 'center',
      marginTop: 3,
    },
    heroImageWrap: {
      alignSelf: 'stretch',
      width: '100%',
      height: 190,
      marginTop: theme.spacing.base,
      borderRadius: theme.radius.rLg,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.color.hairline,
      backgroundColor: theme.color.surfaceRecessed,
    },
    heroImage: {
      width: '100%',
      height: '100%',
    },
    heroAiTag: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.radius.full,
      backgroundColor: 'rgba(27,25,22,0.6)',
    },
    heroAiTagText: {
      fontSize: 10,
      lineHeight: 13,
    },
    heroLockOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      backgroundColor: 'rgba(27,25,22,0.34)',
    },
    heroLockChip: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(27,25,22,0.6)',
    },
    ringWrap: {
      alignItems: 'center',
      paddingTop: theme.spacing.base,
    },
    heroKcal: {
      alignItems: 'center',
      marginTop: theme.spacing.xs,
    },
    heroKcalLbl: {
      letterSpacing: 0.5,
      marginTop: 1,
    },
    whatItIs: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      alignItems: 'flex-start',
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.base,
      padding: 15,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
      ...theme.elevation.e1,
    },
    whatQ: {
      width: 28,
      height: 28,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    whatQText: {
      fontSize: 15,
      lineHeight: 20,
    },
    whatText: {
      flex: 1,
      fontSize: 13.5,
      lineHeight: 20,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xl,
      paddingBottom: theme.spacing.md,
    },
    sectionTitle: {
      fontSize: 16,
    },
    gutter: {
      paddingHorizontal: theme.spacing.base,
    },
    card: {
      marginHorizontal: theme.spacing.base,
      marginTop: theme.spacing.xl,
      padding: 16,
      borderRadius: theme.radius.rLg,
      borderWidth: StyleSheet.hairlineWidth,
      ...theme.elevation.e1,
    },
    cardKicker: {
      fontSize: 12,
      letterSpacing: 1,
      marginBottom: theme.spacing.md,
    },
    ingList: {
      gap: 11,
    },
    ingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    ingNub: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    ingName: {
      flex: 1,
    },
    allergen: {
      marginHorizontal: theme.spacing.base,
      marginTop: theme.spacing.md,
      padding: 16,
      borderRadius: theme.radius.rLg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    chip: {
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: theme.radius.full,
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    chipText: {
      fontSize: 12,
    },
    confirm: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 7,
      marginTop: 11,
    },
    confirmText: {
      flex: 1,
      lineHeight: 17,
    },
    premium: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      marginHorizontal: theme.spacing.base,
      marginTop: theme.spacing.base,
      padding: 13,
      borderRadius: theme.radius.rMd,
      backgroundColor: '#2A2723',
      ...theme.elevation.e1,
    },
    premiumText: {
      flex: 1,
    },
    premiumTitle: {
      color: '#fff',
      fontSize: 13,
    },
    premiumSub: {
      color: '#C9C1B5',
      marginTop: 1,
    },
    premiumGo: {
      fontSize: 12,
    },
    estimateNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginHorizontal: theme.spacing.lg,
      marginTop: theme.spacing.base,
      marginBottom: theme.spacing.lg,
    },
    estimateNoteText: {
      textAlign: 'center',
    },
    foot: {
      paddingHorizontal: theme.spacing.base,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.base,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      paddingVertical: 16,
      borderRadius: 18,
      ...theme.elevation.e2,
    },
    ctaText: {
      fontSize: 15,
    },
    missing: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
  });
}
