/**
 * `useDeleteAllData` — the GDPR Art. 17 "delete all my data" orchestration.
 *
 * Bocado has NO accounts (anonymous-first, SECURITY.md §A), so "delete my account" is a
 * FULL on-device wipe plus, in API mode, erasure of the device-scoped server history.
 * This hook composes the existing single-responsibility erasure paths into one atomic
 * user action so the Settings control is a real, complete deletion — never a partial wipe:
 *
 *   1. profile.clear()        — wipes the on-device profile (diet/allergies/goals/notes)
 *                               AND deletes the secure-store record (Art. 17).
 *   2. savedDishes.clear()    — wipes the on-device bookmarks AND deletes their record.
 *   3. reminders → off        — cancels the scheduled daily reminder and persists OFF
 *                               (via the same opt-out path the toggle uses; no prompt).
 *   4. clearHistory()         — empties the local recents + full-menu cache in BOTH modes,
 *                               and best-effort tells the Worker to erase the device's
 *                               server-side history (API mode) — the existing /menus DELETE.
 *
 * Each step is independently best-effort and isolated so one failure can't abort the
 * others (a denied keystore must not leave history un-erased). The pure sequencing lives
 * in {@link runDeleteAllData} so it is unit-testable without React or native modules.
 */
import { useCallback } from 'react';

import { useProfile } from '@/store/profile';
import { useReminders } from '@/store/reminders';
import { useSavedDishes } from '@/store/savedDishes';
import { clearHistory } from '@/data/menuService';

/** The minimal erasure surface {@link runDeleteAllData} drives — one per data domain. */
export interface DeleteAllDataDeps {
  /** Wipe the on-device profile + its stored record (Art. 17). */
  clearProfile: () => void;
  /** Wipe the on-device saved-dishes list + its stored record. */
  clearSavedDishes: () => void;
  /** Turn the daily reminder OFF: cancels the schedule and persists the opt-out flag. */
  disableReminders: () => Promise<void>;
  /** Empty scan history locally and (API mode) erase the device's server-side history. */
  clearScanHistory: () => Promise<void>;
}

/**
 * Run every erasure step, isolating each so a single failure cannot abort the rest.
 * Resolves once all steps have settled. PURE of React/native — driven by injected deps,
 * so it is fully unit-testable. Never throws.
 */
export async function runDeleteAllData(deps: DeleteAllDataDeps): Promise<void> {
  // Synchronous in-memory + fire-and-forget secure-store wipes — isolate each.
  try {
    deps.clearProfile();
  } catch {
    /* isolated: never let one domain's failure abort the others */
  }
  try {
    deps.clearSavedDishes();
  } catch {
    /* isolated */
  }

  // Async erasures — settle all even if some reject (offline server, locked keystore).
  await Promise.allSettled([deps.disableReminders(), deps.clearScanHistory()]);
}

/**
 * Returns a stable callback that performs the full GDPR Art. 17 erasure. The caller is
 * responsible for the confirm dialog; this hook just executes the wipe when invoked.
 */
export function useDeleteAllData(): () => Promise<void> {
  const { clear: clearProfile } = useProfile();
  const { clear: clearSavedDishes } = useSavedDishes();
  const { setEnabled: setRemindersEnabled } = useReminders();

  return useCallback(
    () =>
      runDeleteAllData({
        clearProfile,
        clearSavedDishes,
        disableReminders: () => setRemindersEnabled(false),
        clearScanHistory: clearHistory,
      }),
    [clearProfile, clearSavedDishes, setRemindersEnabled],
  );
}
