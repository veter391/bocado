/**
 * Entitlement persistence layer for @bocado/mobile.
 *
 * Mirrors `./profileStorage` exactly — two deliberately-split concerns:
 *
 *   1. Serialization (`serializeTier` / `parseTier`) — PURE and node-testable. No
 *      React Native, no `expo-secure-store` import at module load. Anything malformed,
 *      empty, or unknown collapses to the safe default `'free'` (never throws).
 *
 *   2. Device storage (`loadTier` / `saveTier` / `deleteTier`) — wraps
 *      `expo-secure-store`, imported LAZILY so the pure functions stay usable in a
 *      plain Node/Vitest environment.
 *
 * This persists ONLY the coarse tier flag ('free' | 'pro') on-device, so a returning
 * user keeps Pro across cold starts without a network round-trip. It is NOT a receipt
 * and NOT proof of purchase: the authoritative entitlement still comes from the billing
 * provider (RevenueCat/IAP) via the `runPurchase`/`runRestore` seam — this cache is a
 * convenience that any real `restore()` re-validates. No personal/health data here.
 */

/** The two tiers. FREE is the safe default for every unreadable/absent value. */
export type EntitlementTier = 'free' | 'pro';

/** SecureStore key. Versioned so a future schema change can co-exist / clean up. */
export const ENTITLEMENT_STORAGE_KEY = 'bocado.entitlement.v1';

/** Type guard for the only two valid persisted values. */
function isTier(value: unknown): value is EntitlementTier {
  return value === 'free' || value === 'pro';
}

/** Serialize a tier to the exact string written to secure storage. */
export function serializeTier(tier: EntitlementTier): string {
  return isTier(tier) ? tier : 'free';
}

/**
 * Parse a raw stored string back into a tier. Returns 'free' for `null` (nothing
 * stored), empty/whitespace strings, and any unrecognized value. Never throws.
 */
export function parseTier(raw: string | null): EntitlementTier {
  if (raw === null) return 'free';
  const trimmed = raw.trim();
  return isTier(trimmed) ? trimmed : 'free';
}

/**
 * Lazily resolve `expo-secure-store`. Kept out of module scope so importing the pure
 * serialization functions never pulls a native module into a Node test run.
 */
async function getSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/** Read + validate the stored tier. Absent or invalid data yields 'free'. */
export async function loadTier(): Promise<EntitlementTier> {
  try {
    const SecureStore = await getSecureStore();
    const raw = await SecureStore.getItemAsync(ENTITLEMENT_STORAGE_KEY);
    return parseTier(raw);
  } catch {
    // Storage unavailable (e.g. keystore locked) — fail safe to 'free' rather than
    // crash on launch. The user can always restore from the paywall.
    return 'free';
  }
}

/** Persist the tier to the device secure keystore. Best-effort; never throws to callers. */
export async function saveTier(tier: EntitlementTier): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(ENTITLEMENT_STORAGE_KEY, serializeTier(tier));
  } catch {
    // Non-fatal: an unwritable keystore must not break a purchase in memory.
  }
}

/** Remove the stored tier from the device entirely. */
export async function deleteTier(): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(ENTITLEMENT_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
