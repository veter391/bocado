/**
 * Profile persistence layer for @bocado/mobile.
 *
 * Two concerns, deliberately split:
 *
 *   1. Serialization (`serializeProfile` / `parseProfile`) — PURE and node-testable.
 *      No React Native, no `expo-secure-store` import at module load. Every read is
 *      validated with `userProfileSchema` at the trust boundary; anything malformed,
 *      empty, or null collapses to the safe empty profile (never throws, never leaks
 *      a half-parsed shape into the store).
 *
 *   2. Device storage (`loadProfile` / `saveProfile` / `deleteProfile`) — wraps
 *      `expo-secure-store`, imported LAZILY so the pure functions above stay usable
 *      in a plain Node/Vitest environment.
 *
 * Privacy: `allergies` are GDPR Art. 9 health data. They are persisted on-device only,
 * in the OS secure keystore (Keychain / Keystore), and only ever when the user has
 * already granted explicit consent (`consentHealthDataAt`). `deleteProfile` is the
 * GDPR Art. 17 erasure primitive — it wipes the entire stored record.
 */
import { userProfileSchema } from '@bocado/shared';
import type { UserProfile } from '@bocado/shared';

/** SecureStore key. Versioned so a future schema migration can co-exist / clean up. */
export const PROFILE_STORAGE_KEY = 'bocado.profile.v1';

/**
 * The safe default: no diet preference, no health data, no consent. Returned for
 * every unreadable / absent / invalid stored value so callers always get a valid
 * `UserProfile` and never a partial one.
 */
export const emptyProfile: UserProfile = {
  diet: 'none',
  allergies: [],
  goals: [],
};

/** Defensive copy so callers can never mutate the shared `emptyProfile` constant. */
function freshEmptyProfile(): UserProfile {
  return { diet: 'none', allergies: [], goals: [] };
}

/** Serialize a profile to the exact string that gets written to secure storage. */
export function serializeProfile(profile: UserProfile): string {
  // Validate on the way out too: we never want to persist a shape that we would
  // then reject on read (e.g. a future caller passing an unexpected field).
  const parsed = userProfileSchema.parse(profile);
  return JSON.stringify(parsed);
}

/**
 * Parse a raw stored string back into a validated `UserProfile`.
 *
 * Returns the safe empty profile for `null` (nothing stored), empty/whitespace
 * strings, non-JSON garbage, and any value that fails schema validation. Never throws.
 */
export function parseProfile(raw: string | null): UserProfile {
  if (raw === null || raw.trim() === '') {
    return freshEmptyProfile();
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return freshEmptyProfile();
  }

  const result = userProfileSchema.safeParse(json);
  return result.success ? result.data : freshEmptyProfile();
}

/**
 * Lazily resolve `expo-secure-store`. Kept out of module scope so importing the
 * pure serialization functions never pulls a native module into a Node test run.
 */
async function getSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/** Read + validate the stored profile. Absent or invalid data yields the safe default. */
export async function loadProfile(): Promise<UserProfile> {
  try {
    const SecureStore = await getSecureStore();
    const raw = await SecureStore.getItemAsync(PROFILE_STORAGE_KEY);
    return parseProfile(raw);
  } catch {
    // Storage unavailable (e.g. keystore locked) — fail safe to the empty profile
    // rather than crash the app on launch.
    return freshEmptyProfile();
  }
}

/**
 * Persist a profile to the device secure keystore. Best-effort: a write that fails
 * (keystore locked on native, or `expo-secure-store` unavailable — e.g. the web
 * preview, where there is no OS keychain) must never crash the app or surface an
 * unhandled rejection. On such platforms the profile simply isn't persisted — and,
 * deliberately, health data (Art. 9) is NEVER written to a non-secure store as a
 * fallback. Mirrors the same guard in `./entitlementStorage`.
 */
export async function saveProfile(profile: UserProfile): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(PROFILE_STORAGE_KEY, serializeProfile(profile));
  } catch {
    // Non-fatal: an unwritable/absent keystore must not break the in-memory profile.
  }
}

/**
 * GDPR Art. 17 erasure: remove the stored profile (including any health data)
 * from the device entirely. Best-effort for the same reason as `saveProfile`.
 */
export async function deleteProfile(): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(PROFILE_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
