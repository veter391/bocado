/**
 * Reminders store — a THIN React Context over `notifications/reminders.ts`.
 *
 * `useReminders()` exposes the opt-in flag plus the single `setEnabled` mutation the
 * Settings toggle drives. It mirrors the entitlement store: hydrate ONCE on mount with
 * an active guard (default OFF), and a `pending` flag + `inFlight` ref so overlapping
 * taps are ignored.
 *
 * It duplicates NO scheduling logic: `setEnabled` delegates to
 * `reminders.setRemindersEnabled`, which is the single point that ever requests OS
 * permission (only on opt-IN) and schedules / cancels the one daily reminder. We store
 * the EFFECTIVE returned boolean, so a denied permission correctly leaves the toggle
 * OFF rather than optimistically on (SECURITY.md: opt-in, permission-gated, no surprise
 * prompt — nothing here requests permission on mount).
 *
 * Local-only: no push tokens, no server call, no PII (SECURITY.md §1).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { getRemindersEnabled, setRemindersEnabled } from '@/notifications/reminders';

export interface RemindersStore {
  /** Whether the daily reminder is currently enabled (effective state). */
  enabled: boolean;
  /** False until the on-device opt-in flag has been read once on mount. */
  hydrated: boolean;
  /** True while an enable/disable is in flight (drives the toggle's disabled state). */
  pending: boolean;
  /**
   * Opt in (`true`) or out (`false`). Resolves once the effective state is known and
   * stored. On opt-in this is the ONLY point a permission prompt can appear; a denied
   * permission resolves the state back to `false`.
   */
  setEnabled: (next: boolean) => Promise<void>;
}

const RemindersContext = createContext<RemindersStore | null>(null);

export function RemindersProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  // Guard against overlapping toggle taps resolving onto a stale state.
  const inFlight = useRef(false);

  // Hydrate the persisted opt-in flag once on mount. This is a pure read of the stored
  // boolean — it NEVER requests notification permission (that only happens on opt-in).
  useEffect(() => {
    let active = true;
    void getRemindersEnabled().then((stored) => {
      if (!active) return;
      setEnabledState(stored);
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setEnabled = useCallback(async (next: boolean): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      // Store the EFFECTIVE state the seam returns — a denied permission yields false.
      const effective = await setRemindersEnabled(next);
      setEnabledState(effective);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const value = useMemo<RemindersStore>(
    () => ({ enabled, hydrated, pending, setEnabled }),
    [enabled, hydrated, pending, setEnabled],
  );

  return <RemindersContext.Provider value={value}>{children}</RemindersContext.Provider>;
}

export function useReminders(): RemindersStore {
  const ctx = useContext(RemindersContext);
  if (!ctx) {
    throw new Error('useReminders must be used within a <RemindersProvider>.');
  }
  return ctx;
}
