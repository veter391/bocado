/**
 * Scan (DESIGN.md §6A, §7.1, §7.2).
 *
 * Full-bleed camera viewfinder with one primary action (capture). Because the
 * camera must reach every edge, this screen does NOT use the paper `Screen`
 * shell — it lays out directly and reads safe-area insets itself so controls
 * clear the notch / home indicator.
 *
 * MULTI-PAGE CAPTURE: the shutter does NOT analyze immediately. Each tap captures +
 * cleans a photo and ADDS it to an on-screen page tray (thumbnail + count + remove).
 * The gallery button imports one or several library photos into the SAME tray. When
 * the user has the pages they want, an explicit "Analyze (N)" button runs perception
 * over ALL pages in one call. Capped at MAX_PAGES to bound model context + cost.
 *
 * Two animations, both with a job, both gated through motion.motionDuration so
 * reduced-motion collapses them to instant:
 *   - viewfinderLockOn: the four corner brackets ease inward and settle, teaching
 *     the user to frame the menu (fewer blurry scans).
 *   - scanSweep: a soft light line sweeps the frozen frame REPEATEDLY while we read,
 *     masking the real API latency, then stops cleanly when the scan resolves.
 *
 * MEAL CONTEXT: the chip defaults to the device's real current meal context
 * (mealContextForHour(new Date().getHours()), read live) and is tappable to OVERRIDE
 * it (breakfast/lunch/dinner/late-night/snack — snack only reachable here). The chosen
 * context flows into scanAndStore + the on-device engine.
 *
 * The user's profile is read here and passed to the data layer for ON-DEVICE
 * suitability only — it never reaches the server. When the photos are NOT a menu the
 * data layer reports it and we show a calm "this doesn't look like a menu" state rather
 * than fabricating dishes.
 *
 * Camera permission and device may be unavailable in dev / on simulators; we
 * degrade to a plain backdrop so the viewfinder + actions still render.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import * as ImagePicker from 'expo-image-picker';

import { mealContextForHour, type MealContext } from '@bocado/shared';
import { AppText, CaptureTray, EmptyState, HistorySheet, Icon, MealContextSheet, PaperBackground, Wordmark } from '@/components';
import { motion, useTheme } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useProfile } from '@/store/profile';
import { clearHistory, deleteMenu, loadMenu, scanAndStore } from '@/data/menuService';
import { cleanMenuImage } from '@/image/clean';
import type { RootStackScreenProps } from '@/navigation/types';

/**
 * Placeholder image payload used in MOCK mode (no backend) or when the camera is
 * unavailable on a simulator. With a backend configured + a real capture, this is
 * replaced by the cleaned photo's data URL (see the EXIF/face pre-flight TODO).
 */
const MOCK_IMAGE_DATA_URL = 'data:image/jpeg;base64,MOCK_PLACEHOLDER_IMAGE';

/**
 * Max pages per scan. Bounds model context + cost (the /scan route enforces the SAME
 * cap server-side). At the cap the capture + gallery controls disable so the user
 * can't exceed it; they analyze or remove a page first.
 */
const MAX_PAGES = 5;

const FRAME_INSET = 28; // viewfinder inset from screen edges
const BRACKET = 36; // corner bracket arm length
const SWEEP_RANGE = 260; // px the sweep line travels inside the frame

const CONTEXT_LABEL: Record<MealContext, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  'late-night': 'Late night',
  snack: 'Snack',
};

export function ScanScreen({ navigation }: RootStackScreenProps<'Scan'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { profile } = useProfile();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notMenuHint, setNotMenuHint] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  // The pending capture tray: cleaned page images, in capture order.
  const [pages, setPages] = useState<string[]>([]);
  const camera = useRef<Camera>(null);

  // MEAL CONTEXT: default to the device's REAL current time-of-day, read live at mount,
  // overridable via the chip. `mealContextForHour` never yields 'snack' (explicit-only),
  // so snack is reachable purely through the picker.
  const [context, setContext] = useState<MealContext>(() =>
    mealContextForHour(new Date().getHours()),
  );

  // HEAT/BATTERY FIX (DO NOT REGRESS): the camera must only stream when the Scan screen
  // is actually focused AND the app is foregrounded — otherwise the sensor + GPU preview
  // keep running full-rate beneath Results/DishDetail (Scan is the initial stacked route)
  // and while backgrounded, which is the dominant continuous power draw. Gated below via
  // `isActive`. Paired with `freezeOnBlur` on the navigator.
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(true);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  // Guards against double navigation / setState after unmount once a scan resolves.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  // Mark in-flight scans as abandoned if the screen unmounts mid-processing, so a
  // late-resolving scan does not navigate or set state on an unmounted screen.
  useEffect(
    () => () => {
      inFlight.current = false;
    },
    [],
  );

  // 7.1 viewfinder lock-on: brackets ease inward + settle (1 -> 0).
  const lockIn = useSharedValue(reduceMotion ? 0 : 1);
  useEffect(() => {
    const { d, e } = motion.presets.viewfinderLockOn;
    lockIn.value = withTiming(0, {
      duration: motion.motionDuration(d, reduceMotion),
      easing: Easing.bezier(e[0], e[1], e[2], e[3]),
    });
  }, [lockIn, reduceMotion]);

  // 7.2 scan sweep: a light line travels top->bottom REPEATEDLY while "reading", to mask
  // the real (~seconds) API latency. Started in `runScan`, cancelled on resolve/unmount.
  const sweep = useSharedValue(0);

  // Always cancel the sweep animation on unmount so no worklet runs after teardown.
  useEffect(() => () => cancelAnimation(sweep), [sweep]);

  /**
   * Start the repeating sweep. Under reduced motion we DON'T animate (the helper text +
   * dimmed controls still communicate "reading"); otherwise we loop one ease-in-out pass
   * indefinitely until {@link stopSweep} cancels it. One animated element, transform-only.
   */
  const startSweep = useCallback(() => {
    if (reduceMotion) return;
    const { d, e } = motion.presets.scanSweep;
    cancelAnimation(sweep);
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: d, easing: Easing.bezier(e[0], e[1], e[2], e[3]) }),
      -1, // repeat forever…
      false, // …restart from the top each pass (not a mirrored bounce)
    );
  }, [reduceMotion, sweep]);

  /** Stop + reset the sweep cleanly (scan resolved or failed). */
  const stopSweep = useCallback(() => {
    cancelAnimation(sweep);
    sweep.value = 0;
  }, [sweep]);

  /** True while a scan is in flight OR the tray is at the page cap — both disable adds. */
  const atCap = pages.length >= MAX_PAGES;
  const addDisabled = processing || atCap;

  /**
   * Capture (or pick) ONE menu page, clean it, and ADD it to the tray. Does NOT analyze.
   * No-ops at the page cap. Clears any prior error/non-menu state since the user is
   * actively building a fresh scan.
   */
  const addPage = useCallback((dataUrl: string) => {
    setError(null);
    setNotMenuHint(null);
    setPages((prev) => (prev.length >= MAX_PAGES ? prev : [...prev, dataUrl]));
  }, []);

  /** Shutter: take a real photo (or a placeholder in dev), clean it, add it to the tray. */
  const handleCapture = useCallback(() => {
    if (addDisabled) return;
    void captureCleanedImage().then((dataUrl) => addPage(dataUrl));
  }, [addDisabled, addPage]);

  /**
   * Gallery import: pick one OR several library photos into the SAME tray (multi-select),
   * clean each on-device (EXIF/GPS strip + resize), and add up to the remaining capacity.
   */
  const handlePickFromLibrary = useCallback(() => {
    if (addDisabled) return;
    void (async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const remaining = MAX_PAGES - pages.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 1,
      });
      if (result.canceled) return;
      // Clean each picked asset (same on-device pipeline as a capture) before it can be
      // uploaded, and respect the remaining capacity.
      const picked = result.assets.slice(0, remaining);
      for (const asset of picked) {
        try {
          const cleaned = await cleanMenuImage(asset.uri);
          addPage(cleaned);
        } catch {
          // Skip an un-cleanable asset rather than failing the whole import.
        }
      }
    })();
  }, [addDisabled, pages.length, addPage]);

  /** Remove one pending page (retake / drop a bad photo). */
  const removePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /**
   * Analyze ALL pending pages: run the scan-sweep + processing state, hand the pages to
   * the data layer with locale + the chosen meal context + the LOCAL profile (on-device
   * only — never sent to the server), then route to Results, OR show the non-menu state.
   */
  function handleAnalyze(): void {
    if (inFlight.current || pages.length === 0) return;
    inFlight.current = true;
    setError(null);
    setNotMenuHint(null);
    setProcessing(true);
    startSweep();
    void runScan(pages);
  }

  /** Async body of a scan, kept out of the press handler for readability. */
  async function runScan(scanPages: string[]): Promise<void> {
    try {
      // ----------------------------------------------------------------------
      // SECURITY.md §3 / ARCHITECTURE.md §1 step 2 — each page was already cleaned
      // on-device (EXIF/GPS stripped via re-encode) when it was ADDED to the tray, so
      // by here the pages are upload-ready. Face/person + on-device menu pre-flight
      // remain stubbed in `@/image/clean` (deferred — needs ML Kit + a device).
      // ----------------------------------------------------------------------
      const result = await scanAndStore(scanPages, {
        locale: 'en',
        context,
        // ON-DEVICE personalization only — never forwarded to the server.
        profile,
      });

      if (!inFlight.current) return; // unmounted mid-scan
      inFlight.current = false;
      setProcessing(false);
      stopSweep();

      if (result.kind === 'notMenu') {
        // Not a menu / unreadable: keep the tray so the user can retake, and show a calm
        // "this doesn't look like a menu" state. We NEVER fabricate dishes.
        setNotMenuHint(
          result.hint ?? "That doesn't look like a menu. Try another photo of the menu.",
        );
        return;
      }

      // Success: clear the tray and navigate to the results.
      setPages([]);
      navigation.navigate('Results', { menuId: result.menu.id });
    } catch {
      if (!inFlight.current) return;
      inFlight.current = false;
      setProcessing(false);
      stopSweep();
      setError("We couldn't read that menu just now. Let's try another photo.");
    }
  }

  /**
   * Open a menu chosen from history: resolve the full menu into the data-layer cache
   * (so Results' synchronous read finds it), then navigate. Silently no-ops if it can
   * no longer be found (e.g. evicted from a session-only cache).
   */
  function openFromHistory(menuId: string): void {
    setHistoryOpen(false);
    void loadMenu(menuId).then((menu) => {
      if (menu) navigation.navigate('Results', { menuId: menu.id });
    });
  }

  /**
   * Open a saved dish: close the sheet, resolve its menu into the cache (so DishDetail's
   * synchronous read finds it), then navigate. Tolerates a dangling ref whose menu was
   * deleted/evicted — `loadMenu` resolves undefined and we simply no-op (mirrors
   * `openFromHistory`).
   */
  function openSavedDish(menuId: string, dishId: string): void {
    setHistoryOpen(false);
    void loadMenu(menuId).then((menu) => {
      if (menu) navigation.navigate('DishDetail', { menuId: menu.id, dishId });
    });
  }

  /**
   * Produce a CLEANED `data:` URL for a captured menu page.
   *
   * In API mode with a live camera we take a real photo and clean it on-device via
   * `cleanMenuImage` (re-encode → EXIF/GPS stripped, resized, compressed) before it can
   * leave the device. Otherwise — MOCK mode or no camera (dev / simulator) — we return a
   * placeholder so the flow is exercisable end-to-end.
   */
  async function captureCleanedImage(): Promise<string> {
    if (camera.current && device && hasPermission) {
      try {
        const photo = await camera.current.takePhoto();
        // vision-camera returns a file path; normalize to a `file://` URI for
        // the manipulator, then clean (strip EXIF/GPS + resize + compress).
        const uri = photo.path.startsWith('file://') ? photo.path : `file://${photo.path}`;
        // Crop to the on-screen preview aspect so the analyzed photo matches what the
        // viewfinder showed (the full-screen preview center-crops the sensor frame).
        const win = Dimensions.get('window');
        return await cleanMenuImage(uri, { targetAspect: win.width / win.height });
      } catch {
        // Fall through to the placeholder on any capture/cleaning failure.
      }
    }
    return MOCK_IMAGE_DATA_URL;
  }

  // Each bracket eases in from its own corner (transform + opacity only).
  const bracketTL = useAnimatedStyle(() => ({
    transform: [{ translateX: lockIn.value * -10 }, { translateY: lockIn.value * -10 }],
    opacity: 1 - lockIn.value * 0.4,
  }));
  const bracketTR = useAnimatedStyle(() => ({
    transform: [{ translateX: lockIn.value * 10 }, { translateY: lockIn.value * -10 }],
    opacity: 1 - lockIn.value * 0.4,
  }));
  const bracketBL = useAnimatedStyle(() => ({
    transform: [{ translateX: lockIn.value * -10 }, { translateY: lockIn.value * 10 }],
    opacity: 1 - lockIn.value * 0.4,
  }));
  const bracketBR = useAnimatedStyle(() => ({
    transform: [{ translateX: lockIn.value * 10 }, { translateY: lockIn.value * 10 }],
    opacity: 1 - lockIn.value * 0.4,
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: processing ? 0.9 : 0,
    transform: [{ translateY: sweep.value * SWEEP_RANGE - SWEEP_RANGE / 2 }],
  }));

  // The "Analyzing" overlay's accent bar — a calm left-right shuttle driven by the
  // same repeating sweep, so the wait reads as active progress, not a frozen screen.
  const analyzeBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (sweep.value - 0.5) * 140 }],
  }));

  const overlay = error ?? notMenuHint;
  const overlayIsError = error !== null;

  return (
    <View style={styles.root}>
      {/* Camera fills the screen; falls back to a backdrop if unavailable. */}
      <View style={StyleSheet.absoluteFill}>
        {device && hasPermission ? (
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isFocused && appActive && !processing}
            photo
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.color.surfaceDeep }]} />
        )}
        {/* Soft scrim so white brackets + text stay legible on any image. */}
        <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />
      </View>

      {/* Top-right: meal-context chip (tap to override) + a recents entry. Clear of the
          notch. The chip defaults to the live time-of-day context. */}
      <View style={[styles.topRow, { top: insets.top + theme.spacing.sm }]}>
        <Pressable
          onPress={() => setContextOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Meal time: ${CONTEXT_LABEL[context]}. Tap to change.`}
          hitSlop={8}
          style={styles.contextChip}
        >
          <Icon name="Clock" size={16} color="#FFFFFF" />
          <AppText variant="label" style={styles.contextChipText}>
            {CONTEXT_LABEL[context]}
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => setHistoryOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Recent menus"
          hitSlop={8}
          style={styles.historyBtn}
        >
          <Icon name="History" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Inline overlay: a calm EmptyState with a retry over a dimmed frame. Shown when a
          scan fails (error) OR the photo wasn't a menu (notMenu) — never fabricated dishes. */}
      {overlay ? (
        <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
          <EmptyState
            variant={overlayIsError ? 'error' : 'empty'}
            title={overlayIsError ? "Couldn't read this menu" : "That doesn't look like a menu"}
            message={overlay}
            actionLabel="Try again"
            onAction={() => {
              setError(null);
              setNotMenuHint(null);
            }}
          />
        </View>
      ) : null}

      {/* Viewfinder frame with animated corner brackets. */}
      <View style={styles.frameArea} pointerEvents="none">
        <View style={styles.frame}>
          <Animated.View style={[styles.bracket, styles.tl, bracketTL]} />
          <Animated.View style={[styles.bracket, styles.tr, bracketTR]} />
          <Animated.View style={[styles.bracket, styles.bl, bracketBL]} />
          <Animated.View style={[styles.bracket, styles.br, bracketBR]} />
          <Animated.View style={[styles.sweepLine, sweepStyle]} />
        </View>
      </View>

      {/* Helper line — guidance, swaps to a reading message during processing. */}
      <View style={[styles.helper, { bottom: insets.bottom + 132 }]} pointerEvents="none">
        <AppText variant="label" style={styles.helperText}>
          {processing
            ? 'Reading the menu…'
            : pages.length > 0
              ? 'Add more pages or tap Analyze.'
              : 'Point at the menu. Hold steady.'}
        </AppText>
      </View>

      {/* Capture tray (pending pages) sits above the controls when there are pages. */}
      {pages.length > 0 ? (
        <View style={[styles.tray, { bottom: insets.bottom + 96 }]}>
          <CaptureTray
            pages={pages}
            maxPages={MAX_PAGES}
            onRemovePage={removePage}
            onAnalyze={handleAnalyze}
            analyzing={processing}
          />
        </View>
      ) : null}

      {/* Controls. */}
      <View style={[styles.controls, { bottom: insets.bottom + theme.spacing.xl }]}>
        <Pressable
          onPress={() => navigation.navigate('Onboarding')}
          accessibilityRole="button"
          accessibilityLabel="Set up your profile"
          hitSlop={8}
          style={styles.secondaryBtn}
        >
          <Icon name="Settings" size={22} color="#FFFFFF" />
        </Pressable>

        <Pressable
          onPress={handleCapture}
          disabled={addDisabled}
          accessibilityRole="button"
          accessibilityLabel={atCap ? 'Maximum pages added' : 'Add a menu page'}
          style={[styles.captureOuter, { opacity: addDisabled ? 0.5 : 1 }]}
        >
          {({ pressed }) => (
            <View
              style={[
                styles.captureInner,
                { backgroundColor: pressed ? theme.color.primaryPressed : theme.color.primary },
              ]}
            >
              <Icon name="Camera" size={28} color={theme.color.onPrimary} />
            </View>
          )}
        </Pressable>

        <Pressable
          onPress={handlePickFromLibrary}
          disabled={addDisabled}
          accessibilityRole="button"
          accessibilityLabel="Choose photos from your library"
          hitSlop={8}
          style={[styles.secondaryBtn, { opacity: addDisabled ? 0.5 : 1 }]}
        >
          <Icon name="Images" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* ANALYZING: while a scan is in flight, lift OUT of the camera into a calm,
          branded paper preload so it reads as "the app is working", not a frozen
          viewfinder. Covers everything; the camera is already idle (isActive gate). */}
      {processing ? (
        <View style={[StyleSheet.absoluteFill, styles.analyzing]}>
          <PaperBackground style={StyleSheet.absoluteFill}>
            <View style={styles.analyzingInner}>
              <Wordmark size={46} />
              <AppText variant="body" color="textSoft" style={styles.analyzingText}>
                Reading the menu…
              </AppText>
              <View style={styles.analyzeTrack}>
                <Animated.View
                  style={[styles.analyzeBar, { backgroundColor: theme.color.primary }, analyzeBarStyle]}
                />
              </View>
              <AppText variant="caption" color="textSoft" style={styles.analyzingHint}>
                {pages.length > 1 ? `Reading ${pages.length} pages…` : 'This can take a few seconds.'}
              </AppText>
            </View>
          </PaperBackground>
        </View>
      ) : null}

      <MealContextSheet
        open={contextOpen}
        onClose={() => setContextOpen(false)}
        value={context}
        onChange={(c) => {
          setContext(c);
          setContextOpen(false);
        }}
      />

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onOpenMenu={openFromHistory}
        onOpenDish={openSavedDish}
        onDeleteMenu={(id) => void deleteMenu(id)}
        onClearHistory={() => void clearHistory()}
      />
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000000',
    },
    scrim: {
      backgroundColor: 'rgba(30,27,24,0.28)',
    },
    errorOverlay: {
      // Dim the live frame so the calm error panel reads clearly on top of it.
      backgroundColor: 'rgba(30,27,24,0.82)',
      zIndex: 2,
    },
    frameArea: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: FRAME_INSET,
    },
    frame: {
      width: '100%',
      aspectRatio: 0.78,
      maxWidth: 420,
      overflow: 'hidden',
    },
    bracket: {
      position: 'absolute',
      width: BRACKET,
      height: BRACKET,
      borderColor: '#FFFFFF',
    },
    tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
    tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
    bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
    br: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: 8,
    },
    sweepLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '50%',
      height: 2,
      backgroundColor: theme.color.primary,
      shadowColor: theme.color.primary,
      shadowOpacity: 0.8,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    helper: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    helperText: {
      color: '#FFFFFF',
      backgroundColor: 'rgba(30,27,24,0.55)',
      paddingHorizontal: theme.spacing.base,
      paddingVertical: theme.spacing.sm,
      borderRadius: theme.radius.full,
      overflow: 'hidden',
    },
    tray: {
      position: 'absolute',
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      zIndex: 1,
    },
    analyzing: {
      zIndex: 10,
    },
    analyzingInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    analyzingText: {
      marginTop: theme.spacing.sm,
    },
    analyzeTrack: {
      width: 200,
      height: 3,
      borderRadius: 2,
      overflow: 'hidden',
      backgroundColor: theme.color.hairline,
    },
    analyzeBar: {
      width: 70,
      height: 3,
      borderRadius: 2,
    },
    analyzingHint: {
      marginTop: theme.spacing.xs,
    },
    controls: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-evenly',
      paddingHorizontal: theme.spacing.lg,
    },
    secondaryBtn: {
      width: 48,
      height: 48,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(30,27,24,0.45)',
    },
    topRow: {
      position: 'absolute',
      right: theme.spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      zIndex: 3,
    },
    contextChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      height: 44,
      paddingHorizontal: theme.spacing.base,
      borderRadius: theme.radius.full,
      backgroundColor: 'rgba(30,27,24,0.45)',
    },
    contextChipText: {
      color: '#FFFFFF',
    },
    historyBtn: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(30,27,24,0.45)',
    },
    captureOuter: {
      width: 76,
      height: 76,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: 'rgba(255,255,255,0.85)',
    },
    captureInner: {
      width: 60,
      height: 60,
      borderRadius: theme.radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
