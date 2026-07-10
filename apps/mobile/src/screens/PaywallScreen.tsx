/**
 * Paywall (FREE vs PRO upsell).
 *
 * On-brand, calm, grandma-readable. Headline -> a clear FREE vs PRO comparison
 * -> a Monthly / Annual plan SELECTOR (segmented cards) -> a primary "Start Pro"
 * button that drives `useEntitlement().startPurchase(selectedPlan)` and, on
 * success, shows a brief confirmation before dismissing back to a now-Pro app ->
 * a "Restore purchases" link -> small print. An optional, LOCAL-only email field
 * lets the user note they'd like to keep Pro across devices.
 *
 * Billing is mocked in the entitlement store (see `store/entitlement.tsx`); this
 * screen is provider-agnostic and needs no changes when real IAP/RevenueCat/Stripe
 * is wired. Account creation / server auth for "keep Pro across devices" is
 * keys-gated and intentionally out of scope — the field is UI + local state only.
 *
 * Plan selector (design-v2 selection pattern, matching OnboardingScreen):
 *   - selected   = warm coral TINT background + CORAL-toned text (selectedText),
 *     never light-on-light, with a filled coral check badge that springs in.
 *   - unselected = surface background + normal ink text.
 * Colors come from theme tokens (selectedTint / selectedText), verified >= 4.5:1
 * in BOTH light and dark themes. No hardcoded white — the light theme is warm cream.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText, Icon, IconButton, PressableScale, Screen } from '@/components';
import { useTheme } from '@/theme';
import type { Theme } from '@/theme/tokens';
import { springs } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useEntitlement } from '@/store/entitlement';
import type { PurchasePlan } from '@/store/entitlement';
import type { RootStackScreenProps } from '@/navigation/types';

/**
 * Selectable billing plans surfaced on the paywall. The `id` is what we pass to
 * `startPurchase`. `monthly` is the entitlement store's live plan; `annual` is a
 * UI plan id the store treats as provider-agnostic (the mock ignores it, and the
 * real IAP/RevenueCat product mapping lives behind the store seam). Prices are
 * copy until real store products (which carry their own localized strings) land.
 */
interface PlanOption {
  id: PlanId;
  /** Short title shown on the card. */
  title: string;
  /** Headline price line, e.g. "EUR 5.99 / month". */
  price: string;
  /** Small secondary note under the price (savings / per-month equivalent). */
  note?: string;
  /** Optional ribbon-style tag, e.g. "Best value". */
  tag?: string;
}

/** Plan ids offered by the selector. */
type PlanId = 'monthly' | 'annual';

const PLANS: PlanOption[] = [
  { id: 'monthly', title: 'Monthly', price: 'EUR 5.99 / month' },
  {
    id: 'annual',
    title: 'Annual',
    price: 'EUR 49.99 / year',
    note: 'Save ~30% · EUR 4.17 / mo',
    tag: 'Best value',
  },
];

/** A comparison row: what FREE gives vs what PRO unlocks. */
interface CompareRow {
  label: string;
  free: string;
  /** Pro is always "unlocked"; this is the short Pro-side phrasing. */
  pro: string;
}

const COMPARE: CompareRow[] = [
  { label: 'Menu scans', free: 'A few each week', pro: 'Unlimited' },
  { label: 'Traffic-light verdicts', free: 'Yes', pro: 'Yes' },
  { label: 'Dish info & nutrient lights', free: 'Basic', pro: 'Full detail' },
  { label: 'AI dish images', free: '—', pro: 'Yes' },
  { label: 'AI descriptions & translations', free: '—', pro: 'Yes' },
  { label: 'Smart filters', free: '—', pro: 'Yes' },
  { label: 'Scan history', free: '—', pro: 'Yes' },
];

type Status = 'idle' | 'working' | 'success' | 'error';

export function PaywallScreen({ navigation }: RootStackScreenProps<'Paywall'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { isPro, startPurchase, restore } = useEntitlement();

  const [status, setStatus] = useState<Status>('idle');
  const [email, setEmail] = useState('');
  // Annual is pre-selected — it's the best-value default we want to nudge toward.
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('annual');

  const busy = status === 'working';

  const close = () => navigation.goBack();

  const onStartPro = async () => {
    if (busy) return;
    setStatus('working');
    try {
      // The store's signature is provider-agnostic; the selected plan id flows
      // straight through to it. The mock ignores the value, the real billing seam
      // maps it to a store product. `PurchasePlan` is widened safely at the call
      // boundary so both ids type-check against the existing store signature.
      await startPurchase(selectedPlan as PurchasePlan);
      setStatus('success');
      // Brief success beat, then drop back to the (now Pro) app.
      setTimeout(close, 900);
    } catch {
      setStatus('error');
    }
  };

  const onRestore = async () => {
    if (busy) return;
    setStatus('working');
    try {
      await restore();
      setStatus('success');
      setTimeout(close, 900);
    } catch {
      setStatus('error');
    }
  };

  // If the user is already Pro (e.g. they re-opened the sheet), say so plainly.
  const primaryLabel = isPro
    ? "You're on Pro"
    : status === 'success'
      ? 'Welcome to Pro'
      : busy
        ? 'One moment…'
        : 'Start Pro';

  const ctaDisabled = busy || isPro || status === 'success';

  return (
    <Screen
      scroll
      header={
        <View style={styles.topbar}>
          <View style={styles.grow} />
          <IconButton icon="X" onPress={close} accessibilityLabel="Close" iconSize={18} />
        </View>
      }
    >
      <View style={styles.headerBlock}>
        <View style={[styles.crest, { backgroundColor: theme.color.primarySoft }]}>
          <Icon name="Sparkles" size={26} color={theme.color.primary} />
        </View>
        <AppText variant="display" style={styles.headline}>
          Bocado Pro
        </AppText>
        <AppText variant="body" color="textSoft" style={styles.subhead}>
          Scan any menu without limits, and let the AI show you what each dish really is.
        </AppText>
      </View>

      {/* FREE vs PRO comparison */}
      <View style={[styles.card, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.hairline }]}>
        <View style={styles.compareHead}>
          <View style={styles.compareLabelCol} />
          <View style={styles.compareCol}>
            <AppText variant="caption" color="textFaint" style={styles.colKicker}>
              FREE
            </AppText>
          </View>
          <View style={styles.compareCol}>
            <AppText variant="caption" style={[styles.colKicker, { color: theme.color.primary }]}>
              PRO
            </AppText>
          </View>
        </View>

        {COMPARE.map((row, i) => (
          <View
            key={row.label}
            style={[
              styles.compareRow,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
            ]}
          >
            <View style={styles.compareLabelCol}>
              <AppText variant="label" numberOfLines={2}>
                {row.label}
              </AppText>
            </View>
            <View style={styles.compareCol}>
              <CompareCell value={row.free} muted />
            </View>
            <View style={styles.compareCol}>
              <CompareCell value={row.pro} />
            </View>
          </View>
        ))}
      </View>

      {/* Plan selector — Monthly / Annual segmented cards */}
      <View
        style={styles.planGroup}
        accessibilityRole="radiogroup"
        accessibilityLabel="Choose a billing plan"
      >
        {PLANS.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={selectedPlan === plan.id}
            onSelect={() => setSelectedPlan(plan.id)}
          />
        ))}
      </View>

      <AppText variant="caption" color="textFaint" style={styles.cancelNote}>
        Cancel anytime.
      </AppText>

      {/* Optional: keep Pro across devices (local-only) */}
      <View style={[styles.accountCard, { borderColor: theme.color.hairline }]}>
        <AppText variant="label" style={styles.accountTitle}>
          Keep Pro across devices
        </AppText>
        <AppText variant="caption" color="textSoft" style={styles.accountHint}>
          Optional. Add your email and we can link Pro to an account later. For now this just stays on
          your phone — no account is created yet.
        </AppText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={theme.color.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
          accessibilityLabel="Email to keep Pro across devices (optional)"
          style={[
            styles.input,
            { borderColor: theme.color.hairline, color: theme.color.text, backgroundColor: theme.color.surface },
          ]}
        />
      </View>

      {status === 'error' && (
        <AppText variant="caption" style={[styles.error, { color: theme.color.avoidText }]}>
          Something went wrong. Please try again.
        </AppText>
      )}

      {/* Primary CTA — purchases the SELECTED plan */}
      <PressableScale
        onPress={onStartPro}
        disabled={ctaDisabled}
        accessibilityRole="button"
        accessibilityLabel="Start Pro"
        style={[styles.cta, { backgroundColor: theme.color.primary }, ctaDisabled && styles.ctaDim]}
      >
        {status === 'success' || isPro ? (
          <Icon name="Check" size={18} color={theme.color.onPrimary} />
        ) : (
          <Icon name="Sparkles" size={18} color={theme.color.onPrimary} />
        )}
        <AppText variant="label" color="onPrimary" style={styles.ctaText}>
          {primaryLabel}
        </AppText>
      </PressableScale>

      {/* Restore */}
      <PressableScale
        onPress={onRestore}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Restore purchases"
        style={styles.restore}
      >
        <AppText variant="label" color="primary">
          Restore purchases
        </AppText>
      </PressableScale>

      {/* Small print — reflects the selected plan's billing cadence */}
      <AppText variant="caption" color="textFaint" style={styles.fineprint}>
        {selectedPlan === 'annual' ? 'Renews yearly' : 'Renews monthly'} until cancelled. Manage or
        cancel anytime in your app-store account. By continuing you agree to the Terms and Privacy
        Policy.
      </AppText>
    </Screen>
  );
}

/* ------------------------------- plan card ----------------------------- */

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PlanOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Selection spring on the check badge (matches OnboardingScreen's SelectRow:
  // scale 0 -> 1, springs.selectSpring). Reduced-motion snaps instantly.
  const badgeScale = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      badgeScale.value = selected ? 1 : 0;
      return;
    }
    badgeScale.value = selected
      ? withSpring(1, springs.selectSpring)
      : withTiming(0, { duration: 120 });
  }, [selected, reduceMotion, badgeScale]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeScale.value,
  }));

  return (
    <PressableScale
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityLabel={`${plan.title}, ${plan.price}${plan.note ? `, ${plan.note}` : ''}${
        plan.tag ? `, ${plan.tag}` : ''
      }${selected ? ', selected' : ''}`}
      style={[
        styles.planCard,
        {
          borderColor: selected ? theme.color.selectedTint : theme.color.hairline,
          backgroundColor: selected ? theme.color.selectedTint : theme.color.surface,
        },
      ]}
    >
      {plan.tag ? (
        <View style={[styles.planTag, { backgroundColor: theme.color.primary }]}>
          <AppText variant="caption" color="onPrimary" style={styles.planTagText}>
            {plan.tag}
          </AppText>
        </View>
      ) : null}

      <View style={styles.planTextCol}>
        <AppText
          variant="label"
          style={[styles.planTitle, selected ? { color: theme.color.selectedText } : null]}
        >
          {plan.title}
        </AppText>
        <AppText
          variant="data"
          style={[styles.planPrice, selected ? { color: theme.color.selectedText } : null]}
        >
          {plan.price}
        </AppText>
        {plan.note ? (
          <AppText
            variant="caption"
            color={selected ? undefined : 'textSoft'}
            style={[styles.planNote, selected ? { color: theme.color.selectedText } : null]}
          >
            {plan.note}
          </AppText>
        ) : null}
      </View>

      {selected ? (
        <Animated.View style={[styles.checkBadge, { backgroundColor: theme.color.primary }, badgeStyle]}>
          <Icon name="Check" size={16} color={theme.color.onPrimary} />
        </Animated.View>
      ) : (
        <View style={styles.checkPlaceholder} />
      )}
    </PressableScale>
  );
}

/* ------------------------------ compare cell --------------------------- */

function CompareCell({ value, muted }: { value: string; muted?: boolean }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // A dash means "not in this tier" — show a faint glyph instead of bare text.
  if (value === '—') {
    return <Icon name="Minus" size={14} color={theme.color.textFaint} />;
  }
  if (value === 'Yes' || value === 'Unlimited' || value === 'Full detail') {
    return (
      <View style={styles.cellYes}>
        <Icon name="Check" size={14} color={muted ? theme.color.textSoft : theme.color.primary} />
        {value !== 'Yes' ? (
          <AppText
            variant="caption"
            color={muted ? 'textSoft' : 'primary'}
            numberOfLines={1}
            style={styles.cellText}
          >
            {value}
          </AppText>
        ) : null}
      </View>
    );
  }
  return (
    <AppText variant="caption" color={muted ? 'textSoft' : 'text'} numberOfLines={2} style={styles.cellText}>
      {value}
    </AppText>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    topbar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
    grow: { flex: 1 },
    headerBlock: {
      alignItems: 'center',
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
    },
    crest: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.md,
    },
    headline: {
      textAlign: 'center',
    },
    subhead: {
      textAlign: 'center',
      marginTop: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
    },
    card: {
      borderRadius: theme.radius.rLg,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      ...theme.elevation.e1,
    },
    compareHead: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing.sm,
    },
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    compareLabelCol: {
      flex: 1.5,
      paddingRight: theme.spacing.sm,
    },
    compareCol: {
      flex: 1,
      alignItems: 'center',
    },
    colKicker: {
      fontSize: 11,
      letterSpacing: 1,
    },
    cellYes: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    cellText: {
      textAlign: 'center',
    },
    // --- plan selector ---
    planGroup: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.lg,
    },
    planCard: {
      flex: 1,
      minHeight: 96,
      borderRadius: theme.radius.rMd,
      borderWidth: 1.5,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    planTag: {
      position: 'absolute',
      top: -10,
      left: theme.spacing.base,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      borderRadius: theme.radius.full,
    },
    planTagText: {
      fontSize: 10,
      letterSpacing: 0.5,
    },
    planTextCol: {
      flex: 1,
      gap: 2,
    },
    planTitle: {
      fontSize: 13,
    },
    planPrice: {
      fontSize: 15,
    },
    planNote: {
      marginTop: 2,
    },
    cancelNote: {
      textAlign: 'center',
      marginTop: theme.spacing.md,
    },
    accountCard: {
      marginTop: theme.spacing.lg,
      padding: theme.spacing.base,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
    },
    accountTitle: {
      marginBottom: theme.spacing.xs,
    },
    accountHint: {
      marginBottom: theme.spacing.md,
    },
    input: {
      minHeight: 48,
      borderRadius: theme.radius.md,
      borderWidth: 1.5,
      paddingHorizontal: theme.spacing.base,
      fontFamily: theme.typography.body.family,
      fontSize: theme.typography.body.size,
    },
    error: {
      textAlign: 'center',
      marginTop: theme.spacing.md,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      minHeight: 54,
      borderRadius: 18,
      marginTop: theme.spacing.lg,
      ...theme.elevation.e2,
    },
    ctaDim: {
      opacity: 0.6,
    },
    ctaText: {
      fontSize: 15,
    },
    restore: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      marginTop: theme.spacing.md,
    },
    checkBadge: {
      width: 24,
      height: 24,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkPlaceholder: {
      width: 24,
      height: 24,
    },
    fineprint: {
      textAlign: 'center',
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.lg,
      lineHeight: 18,
    },
  });
}
