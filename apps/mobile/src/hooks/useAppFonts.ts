/**
 * Loads the brand fonts (Fraunces display/title + Inter body/caption/data +
 * Inter-Medium label) referenced by the typography tokens, and reports when the
 * app is safe to render.
 *
 * The font registry — and the family-key mapping that MUST match
 * `typography.*.family` in `theme/tokens.ts` ('Fraunces' / 'Inter' /
 * 'Inter-Medium') — lives in `@/theme/fonts`. This hook only orchestrates
 * loading + the native splash.
 *
 * Robustness (BRANDING.md §4: a missing/failed brand font must NEVER block first
 * paint — the system font is an acceptable fallback):
 *   - `SplashScreen.preventAutoHideAsync()` runs at module load so the native
 *     splash stays up until we decide the app is ready.
 *   - We treat the app as ready when `useFonts` resolves (loaded OR errored), and
 *     ALWAYS after a short safety timeout — so a hung/failed font load can never
 *     trap the user on the splash forever.
 *   - Once ready we hide the native splash. All splash calls are best-effort
 *     (swallowed) because on some platforms/timing they can reject (e.g. the
 *     splash is already hidden), and such a rejection must not crash the app.
 *
 * Returns `true` once the app is safe to render.
 */
import { useEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { fontMap } from '@/theme/fonts';

/**
 * Hard ceiling on how long we hold the splash for fonts. After this we render
 * with whatever is available (brand or system font). Generous enough for a cold
 * first load, short enough that a stuck loader never strands the user.
 */
const SAFETY_TIMEOUT_MS = 4_000;

// Keep the native splash up from the moment this module is evaluated (before
// first render) until we explicitly hide it. Best-effort: a rejection here just
// means the splash was already configured to auto-hide, which is harmless.
void SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op: splash may already be hidden/unavailable */
});

/** Best-effort splash hide; never throws into React. */
function hideSplash(): void {
  void SplashScreen.hideAsync().catch(() => {
    /* no-op: already hidden or unavailable */
  });
}

export function useAppFonts(): boolean {
  // `error` is non-null if a font asset fails to load; we still proceed (fallback
  // to system font) rather than block the app.
  const [loaded, error] = useFonts(fontMap);
  const fontsResolved = loaded || error != null;

  // Independent safety net: flips ready even if `useFonts` never resolves.
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), SAFETY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const ready = fontsResolved || timedOut;

  // Hide the native splash exactly when we transition to ready. The effect's
  // dependency on `ready` keeps it a single hide on the rising edge.
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

  return ready;
}
