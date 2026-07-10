/**
 * Onboarding / profile (DESIGN.md §6D).
 *
 * One question per step: diet -> allergies -> goals. ANONYMOUS-FIRST (founder-
 * approved): there is NO signup wall and NO account is ever required. Every step
 * is fully skippable end-to-end — a clear "Skip" in the top bar lands the user
 * straight in the app from ANY step, and the first step carries one short
 * reassuring line ("No account needed — everything stays on your phone. You can
 * set this up later."). The app works fully with no profile (PRODUCT.md audience
 * A). The allergies step
 * is gated behind an explicit, unbundled ConsentToggle because allergies are
 * GDPR Art. 9 health data (SECURITY.md §A): no allergy can be selected until the
 * user actively turns consent on, and the toggle copy says what is stored and why.
 *
 * Plain, grandma-readable copy throughout.
 *
 * Selection pattern (design-v2, fixes the invisible-text contrast bug):
 *   - selected  = warm coral TINT background + CORAL-colored text (never
 *     light-on-light) + a small filled coral check badge that springs in.
 *   - unselected = surface background + normal ink text.
 * The selected text/tint pair is verified >= 4.5:1 in BOTH light and dark themes
 * (see selectionColors()). The check badge color is never the only signal — the
 * label text itself turns coral and the row reads its checked state to a11y.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  ALLERGENS,
  DIETS,
  GOALS,
  type AllergenId,
  type DietId,
  type GoalId,
} from '@bocado/shared';
import { AppText, ConsentToggle, Icon, PressableScale, Screen } from '@/components';
import { useTheme } from '@/theme';
import type { Theme } from '@/theme';
import { springs } from '@/theme/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useProfile } from '@/store/profile';
import { useReminders } from '@/store/reminders';
import { useDeleteAllData } from '@/hooks/useDeleteAllData';
import { clearHistory } from '@/data/menuService';
import type { RootStackScreenProps } from '@/navigation/types';
import { BackButton } from './BackButton';

type Step = 'diet' | 'allergies' | 'goals';
const STEPS: Step[] = ['diet', 'allergies', 'goals'];

const STEP_COPY: Record<Step, { title: string; help: string }> = {
  diet: {
    title: 'How do you eat?',
    help: 'Pick one. This helps us rank dishes for you. You can change it any time.',
  },
  allergies: {
    title: 'Anything you avoid?',
    help: 'Tell us your allergies so we can flag dishes. This is private and stays on your phone.',
  },
  goals: {
    title: "What's your aim?",
    help: 'Pick any that fit. We use this to gently sort the menu. Skip if you like.',
  },
};

export function OnboardingScreen({ navigation }: RootStackScreenProps<'Onboarding'>) {
  const theme = useTheme();
  const {
    profile,
    hasHealthConsent,
    setDiet,
    toggleAllergy,
    toggleGoal,
    setOtherNotes,
    grantHealthConsent,
    revokeHealthConsent,
  } = useProfile();

  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex] ?? 'diet';
  const isLast = stepIndex === STEPS.length - 1;

  const finish = () => navigation.navigate('Scan');
  const next = () => (isLast ? finish() : setStepIndex((i) => Math.min(i + 1, STEPS.length - 1)));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Screen padded={false}>
      <View style={styles.topBar}>
        {stepIndex > 0 ? (
          <BackButton onPress={back} label="Go back one step" />
        ) : (
          <View style={styles.iconBtn} />
        )}

        <View
          style={styles.progress}
          accessibilityLabel={`Step ${stepIndex + 1} of ${STEPS.length}`}
        >
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                { backgroundColor: i <= stepIndex ? theme.color.primary : theme.color.hairline },
              ]}
            />
          ))}
        </View>

        <Pressable
          onPress={finish}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Skip setup"
          style={styles.iconBtn}
        >
          <AppText variant="label" color="textSoft">
            Skip
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="display" style={styles.title}>
          {STEP_COPY[step].title}
        </AppText>
        <AppText variant="body" color="textSoft" style={styles.help}>
          {STEP_COPY[step].help}
        </AppText>

        {/* Anonymous-first reassurance — only on the first step. No signup wall:
            the whole flow is optional and can be skipped straight into the app. */}
        {stepIndex === 0 ? (
          <View
            style={[
              styles.reassure,
              { backgroundColor: theme.color.primarySoft, borderColor: theme.color.hairline },
            ]}
          >
            <Icon name="ShieldCheck" size={16} color={theme.color.primary} />
            <AppText variant="caption" color="textSoft" style={styles.reassureText}>
              No account needed — everything stays on your phone. You can set this up later.
            </AppText>
          </View>
        ) : null}

        {step === 'diet' && <DietStep diet={profile.diet} onSelect={setDiet} />}

        {step === 'allergies' && (
          <AllergyStep
            hasConsent={hasHealthConsent}
            selected={profile.allergies}
            onToggleConsent={(on) => (on ? grantHealthConsent() : revokeHealthConsent())}
            onToggleAllergy={toggleAllergy}
          />
        )}

        {step === 'goals' && (
          <GoalStep
            selected={profile.goals}
            onToggle={toggleGoal}
            otherNotes={profile.otherNotes ?? ''}
            onChangeOtherNotes={setOtherNotes}
            hasHealthConsent={hasHealthConsent}
          />
        )}

        {/* Settings — appended to the last step only. Daily reminder (opt-in) + the
            GDPR Art. 17 "clear scan history" affordance. Additive; no layout redesign. */}
        {isLast ? <SettingsBlock /> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={next}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Finish setup' : 'Next step'}
          style={({ pressed }) => [
            styles.primaryBtn,
            { backgroundColor: pressed ? theme.color.primaryPressed : theme.color.primary },
          ]}
        >
          <AppText variant="label" color="onPrimary">
            {isLast ? 'Done' : 'Next'}
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

/* ------------------------------- steps -------------------------------- */

function DietStep({ diet, onSelect }: { diet: DietId; onSelect: (d: DietId) => void }) {
  return (
    <View accessibilityRole="radiogroup">
      {DIETS.map((d) => (
        <SelectRow
          key={d.id}
          label={d.label}
          selected={diet === d.id}
          mode="single"
          onPress={() => onSelect(d.id)}
        />
      ))}
    </View>
  );
}

function AllergyStep({
  hasConsent,
  selected,
  onToggleConsent,
  onToggleAllergy,
}: {
  hasConsent: boolean;
  selected: AllergenId[];
  onToggleConsent: (on: boolean) => void;
  onToggleAllergy: (a: AllergenId) => void;
}) {
  const theme = useTheme();
  return (
    <View>
      <ConsentToggle
        value={hasConsent}
        onChange={onToggleConsent}
        title="Store my allergies on this phone"
        description="We keep them only on your device to flag dishes for you. We never say a dish is safe — always confirm with staff. You can turn this off any time."
      />

      {hasConsent ? (
        <View style={{ marginTop: theme.spacing.lg }} accessibilityRole="list">
          {ALLERGENS.map((a) => (
            <SelectRow
              key={a.id}
              label={a.label}
              selected={selected.includes(a.id)}
              mode="multi"
              onPress={() => onToggleAllergy(a.id)}
            />
          ))}
        </View>
      ) : (
        <AppText
          variant="caption"
          color="textSoft"
          style={{ marginTop: theme.spacing.base, textAlign: 'center' }}
        >
          Turn the switch on to choose your allergies, or skip this step.
        </AppText>
      )}
    </View>
  );
}

function GoalStep({
  selected,
  onToggle,
  otherNotes,
  onChangeOtherNotes,
  hasHealthConsent,
}: {
  selected: GoalId[];
  onToggle: (g: GoalId) => void;
  otherNotes: string;
  onChangeOtherNotes: (notes: string) => void;
  hasHealthConsent: boolean;
}) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Local draft so typing stays snappy; the store only persists under consent.
  const [draft, setDraft] = useState(otherNotes);

  const onChange = (text: string) => {
    setDraft(text);
    // `setOtherNotes` is a no-op without health consent (it may describe a
    // condition — Art. 9). We still let the user type; nothing is stored until
    // they turn the health-data switch on (on the previous step).
    onChangeOtherNotes(text);
  };

  return (
    <View accessibilityRole="list">
      {GOALS.map((g) => (
        <SelectRow
          key={g.id}
          label={g.label}
          selected={selected.includes(g.id)}
          mode="multi"
          onPress={() => onToggle(g.id)}
        />
      ))}

      {/* Free-text "anything else" — a special diet or condition the AI can tailor to. */}
      <View style={styles.otherBlock}>
        <AppText variant="label" style={styles.otherLabel}>
          Other / anything else?
        </AppText>
        <AppText variant="caption" color="textSoft" style={styles.otherHint}>
          A special diet or anything to watch for — e.g. "low FODMAP" or "no shellfish at all".
          Bocado will use this to tailor what it recommends.
        </AppText>
        <TextInput
          value={draft}
          onChangeText={onChange}
          editable={hasHealthConsent}
          placeholder="Type anything you'd like us to know"
          placeholderTextColor={theme.color.textFaint}
          multiline
          maxLength={280}
          accessibilityLabel="Other diet or condition (optional)"
          style={[
            styles.otherInput,
            {
              borderColor: theme.color.hairline,
              backgroundColor: hasHealthConsent ? theme.color.surface : theme.color.surfaceDeep,
              color: theme.color.text,
            },
          ]}
        />
        {!hasHealthConsent ? (
          <AppText variant="caption" color="textSoft" style={styles.otherConsentNote}>
            This may describe a health condition, so it stays private on your phone. Turn on the
            health-data switch on the previous step to save it, or skip.
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------ settings ------------------------------- */

/**
 * Appended Settings block: a single daily-reminder opt-in switch (reusing
 * ConsentToggle, so it shares the affirmative-switch a11y + motion) and a destructive
 * "Clear scan history" row (GDPR Art. 17). Both are additive — no existing step,
 * skip, or consent gating is changed.
 */
function SettingsBlock() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { enabled, hydrated, pending, setEnabled } = useReminders();
  const deleteAllData = useDeleteAllData();
  const [clearing, setClearing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onClearHistory = () => {
    Alert.alert(
      'Clear scan history?',
      'This removes every menu you have scanned from this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: () => {
            setClearing(true);
            void clearHistory().finally(() => setClearing(false));
          },
        },
      ],
    );
  };

  // GDPR Art. 17 — full erasure. Bocado has no accounts, so "delete my data" wipes
  // EVERYTHING on this device (profile, allergies, saved dishes, the reminder pref, and
  // scan history) and, in API mode, the device's server-side history too. Behind an
  // explicit destructive confirm; runs through the composed erasure hook.
  const onDeleteAllData = () => {
    if (deleting) return;
    Alert.alert(
      'Delete all my data?',
      'This permanently removes your profile, allergies, saved dishes, reminder setting, and scan history from this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            setDeleting(true);
            void deleteAllData().finally(() => setDeleting(false));
          },
        },
      ],
    );
  };

  return (
    <View style={styles.settingsBlock}>
      <AppText variant="label" color="textFaint" style={styles.settingsKicker}>
        SETTINGS
      </AppText>

      {/* Reminder toggle. Disabled until hydrated (so it can't race the stored flag) or
          while a toggle is in flight. The switch reflects the EFFECTIVE state — a denied
          OS permission leaves it off. ConsentToggle requests nothing on mount. */}
      <View style={pending || !hydrated ? styles.settingsDisabled : undefined}>
        <ConsentToggle
          value={enabled}
          onChange={(next) => {
            if (!hydrated || pending) return;
            void setEnabled(next);
          }}
          title="Daily menu reminder"
          description="A single gentle nudge before lunch. Off unless you turn it on."
        />
      </View>

      {/* GDPR Art. 17 — clear scan history. */}
      <PressableScale
        onPress={onClearHistory}
        accessibilityRole="button"
        accessibilityLabel="Clear scan history"
        style={[styles.clearRow, { backgroundColor: theme.color.surface, borderColor: theme.color.hairline }]}
      >
        <Icon name="Trash2" size={18} color={theme.color.avoid} />
        <View style={styles.clearRowText}>
          <AppText variant="label" style={{ color: theme.color.avoid }}>
            Clear scan history
          </AppText>
          <AppText variant="caption" color="textSoft">
            {clearing ? 'Clearing…' : 'Remove every scanned menu from this device.'}
          </AppText>
        </View>
      </PressableScale>

      {/* GDPR Art. 17 — delete all on-device data (the "delete account" equivalent;
          no accounts exist, so it is a full on-device + server-history wipe). */}
      <PressableScale
        onPress={onDeleteAllData}
        disabled={deleting}
        accessibilityRole="button"
        accessibilityLabel="Delete all my data"
        style={[styles.clearRow, { backgroundColor: theme.color.surface, borderColor: theme.color.avoid }]}
      >
        <Icon name="ShieldOff" size={18} color={theme.color.avoid} />
        <View style={styles.clearRowText}>
          <AppText variant="label" style={{ color: theme.color.avoid }}>
            Delete all my data
          </AppText>
          <AppText variant="caption" color="textSoft">
            {deleting
              ? 'Deleting…'
              : 'Erase your profile, saved dishes, settings, and history.'}
          </AppText>
        </View>
      </PressableScale>
    </View>
  );
}

/* ------------------------------ select row ----------------------------- */

function SelectRow({
  label,
  selected,
  mode,
  onPress,
}: {
  label: string;
  selected: boolean;
  mode: 'single' | 'multi';
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Selection spring on the check badge (scale 0 -> 1, springs.selectSpring:
  // stiffness 500 / damping 30). The selected colors come from theme tokens
  // (selectedTint + selectedText), both verified >= 4.5:1 — this is the fix for
  // the invisible light-on-light text bug. Reduced-motion snaps instantly.
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
      onPress={onPress}
      accessibilityRole={mode === 'single' ? 'radio' : 'checkbox'}
      accessibilityLabel={label}
      style={[
        styles.row,
        {
          borderColor: selected ? theme.color.selectedTint : theme.color.hairline,
          backgroundColor: selected ? theme.color.selectedTint : theme.color.surface,
        },
      ]}
    >
      <AppText
        variant="body"
        style={[styles.rowLabel, selected ? { color: theme.color.selectedText } : null]}
        numberOfLines={2}
      >
        {label}
      </AppText>

      {selected ? (
        <Animated.View
          style={[styles.checkBadge, { backgroundColor: theme.color.primary }, badgeStyle]}
        >
          <Icon name="Check" size={16} color={theme.color.onPrimary} />
        </Animated.View>
      ) : (
        <View style={styles.checkPlaceholder} />
      )}
    </PressableScale>
  );
}

/* -------------------------------- styles ------------------------------- */

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.sm,
    },
    iconBtn: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    progress: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    progressDot: {
      width: 24,
      height: 4,
      borderRadius: theme.radius.full,
    },
    scrollContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.base,
      paddingBottom: theme.spacing.xxl,
    },
    title: {
      marginBottom: theme.spacing.sm,
    },
    help: {
      marginBottom: theme.spacing.lg,
    },
    reassure: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.base,
      borderRadius: theme.radius.rMd,
      borderWidth: StyleSheet.hairlineWidth,
      marginBottom: theme.spacing.xl,
    },
    reassureText: {
      flex: 1,
      lineHeight: 18,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.base,
      borderRadius: theme.radius.lg,
      borderWidth: 1.5,
      marginBottom: theme.spacing.md,
    },
    rowLabel: {
      flex: 1,
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
    otherBlock: {
      marginTop: theme.spacing.lg,
    },
    otherLabel: {
      marginBottom: theme.spacing.xs,
    },
    otherHint: {
      marginBottom: theme.spacing.md,
    },
    otherInput: {
      minHeight: 88,
      borderRadius: theme.radius.lg,
      borderWidth: 1.5,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      textAlignVertical: 'top',
      fontFamily: theme.typography.body.family,
      fontSize: theme.typography.body.size,
    },
    otherConsentNote: {
      marginTop: theme.spacing.sm,
    },
    settingsBlock: {
      marginTop: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    settingsKicker: {
      letterSpacing: 1,
    },
    settingsDisabled: {
      opacity: 0.5,
    },
    clearRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 56,
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.md,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
    },
    clearRowText: {
      flex: 1,
      gap: 2,
    },
    footer: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    primaryBtn: {
      minHeight: 52,
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
