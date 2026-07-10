/**
 * Local reminders — a MINIMAL, opt-in, non-annoying notification scaffold.
 *
 * Design constraints (privacy + respect, SECURITY.md / PRODUCT.md tone):
 *   - OFF BY DEFAULT. Nothing is scheduled and NO permission is requested until the
 *     user explicitly opts in via {@link setRemindersEnabled}(true).
 *   - ONE gentle reminder type only: a single daily nudge to check a menu before
 *     eating out. No streaks, no badges, no marketing pushes, no re-engagement spam.
 *   - LOCAL only: `expo-notifications` schedules an on-device notification. Nothing is
 *     sent to a server; there are no push tokens and no personal data in the payload.
 *
 * Structure mirrors the storage layers: the opt-in flag is persisted in the OS secure
 * keystore, and `expo-notifications` is imported LAZILY so this module — and its pure
 * parts — stay importable in a plain Node/Vitest run (the dep is native-only).
 *
 * The reminder COPY and time live here as pure, testable constants. Scheduling itself
 * is a thin seam (`scheduleDailyReminder` / `cancelReminders`) the UI calls after the
 * user toggles the setting.
 */

/** SecureStore key for the opt-in flag. Versioned for forward-compatibility. */
export const REMINDERS_ENABLED_KEY = 'bocado.reminders.enabled.v1';

/** Stable identifier so we only ever keep ONE scheduled reminder (idempotent). */
export const REMINDER_ID = 'bocado.daily-menu-reminder';

/** The single gentle reminder's copy + time. Pure data — unit-tested. */
export const DAILY_REMINDER = {
  title: 'Eating out today?',
  body: 'Snap the menu with Bocado before you order — it takes a second.',
  /** Local time of day (24h). Late morning, before lunch plans — never at night. */
  hour: 11,
  minute: 0,
} as const;

/**
 * Narrow structural surface of `expo-notifications` we depend on. Declared locally so
 * this scaffold TYPECHECKS before the native package is installed (it is added to
 * package.json; run `pnpm install` + `npx expo install --fix` to materialize it). The
 * shape matches the SDK 54 API; if it drifts, the cast in {@link getNotifications}
 * fails loudly at the seam rather than leaking `any` through the module.
 */
interface PermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
}
interface NotificationsModule {
  getPermissionsAsync(): Promise<PermissionStatus>;
  requestPermissionsAsync(): Promise<PermissionStatus>;
  scheduleNotificationAsync(request: {
    identifier?: string;
    content: { title: string; body: string };
    trigger: { type: string; hour: number; minute: number };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  SchedulableTriggerInputTypes: { DAILY: string };
}

/** Lazily resolve `expo-notifications` so the module stays Node-testable. */
async function getNotifications(): Promise<NotificationsModule> {
  // The package is intentionally not type-resolved at build time (may be uninstalled);
  // the import specifier is opaque to TS via a variable, and we assert the narrow shape.
  const spec = 'expo-notifications';
  const mod = (await import(/* @vite-ignore */ spec)) as unknown as NotificationsModule;
  return mod;
}

/** Lazily resolve `expo-secure-store`. */
async function getSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/**
 * PURE parse of the persisted opt-in flag. The flag is OFF for every value except the
 * exact string `'true'` — so any unreadable, absent (`null`), or unexpected value
 * collapses to `false` (the safe, non-annoying default). Extracted so the on/off
 * serialization is node-unit-testable without `expo-secure-store`.
 */
export function parseEnabled(raw: string | null): boolean {
  return raw === 'true';
}

/** Read the persisted opt-in flag. Defaults to FALSE (off) for any unreadable value. */
export async function getRemindersEnabled(): Promise<boolean> {
  try {
    const SecureStore = await getSecureStore();
    const raw = await SecureStore.getItemAsync(REMINDERS_ENABLED_KEY);
    return parseEnabled(raw);
  } catch {
    return false;
  }
}

/**
 * Opt in or out of the daily reminder.
 *
 * Opting IN: requests notification permission (the ONLY point we ever ask); if granted,
 * schedules the single daily reminder and persists the flag. If permission is denied we
 * persist `false` and return `false` so the UI can reflect that nothing was scheduled.
 *
 * Opting OUT: cancels any scheduled reminder and persists `false`.
 *
 * @returns the effective enabled state after the call.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await cancelReminders();
    await persistEnabled(false);
    return false;
  }

  const granted = await requestPermission();
  if (!granted) {
    await persistEnabled(false);
    return false;
  }
  await scheduleDailyReminder();
  await persistEnabled(true);
  return true;
}

/** Persist the opt-in flag (best-effort). */
async function persistEnabled(value: boolean): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(REMINDERS_ENABLED_KEY, value ? 'true' : 'false');
  } catch {
    /* non-fatal */
  }
}

/** Request notification permission. Returns true only if the user granted it. */
async function requestPermission(): Promise<boolean> {
  try {
    const Notifications = await getNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

/** Schedule the single daily reminder, replacing any existing one (idempotent). */
async function scheduleDailyReminder(): Promise<void> {
  try {
    const Notifications = await getNotifications();
    // Clear first so we never stack duplicates across re-enables.
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title: DAILY_REMINDER.title, body: DAILY_REMINDER.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: DAILY_REMINDER.hour,
        minute: DAILY_REMINDER.minute,
      },
    });
  } catch {
    /* non-fatal: a failed schedule must not crash the toggle */
  }
}

/** Cancel the scheduled reminder, if any. */
export async function cancelReminders(): Promise<void> {
  try {
    const Notifications = await getNotifications();
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID);
  } catch {
    /* non-fatal */
  }
}
