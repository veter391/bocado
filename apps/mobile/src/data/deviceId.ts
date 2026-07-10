/**
 * Anonymous, per-install device id for the saved-menus (history) endpoint.
 *
 * The `/menus` Worker endpoint is ANONYMOUS by contract (like `/scan` and `/image`):
 * it stores a user's recently-scanned menus keyed by an opaque random id that lives
 * ONLY on this device. This id is:
 *   - random (crypto-strong where available; never derived from hardware, the user, or
 *     any personal data — it is not a tracking identifier and carries no PII),
 *   - generated once and cached in the OS secure keystore (`expo-secure-store`),
 *   - sent as the `X-Device-Id` header so the server can scope a device's own history.
 *
 * Pure id generation (`generateDeviceId`) is node-testable; the keystore wrapper imports
 * SecureStore LAZILY so the pure helper stays usable in a plain Node/Vitest run.
 */

/** SecureStore key. Versioned so a future rotation can co-exist / clean up. */
export const DEVICE_ID_STORAGE_KEY = 'bocado.deviceId.v1';

/**
 * Generate a fresh opaque device id. Prefers `crypto.randomUUID()` (RN/Hermes + Node
 * both expose it); falls back to a random-hex string only if crypto is unavailable.
 * Pure aside from randomness — no I/O, no clock dependence for correctness.
 */
export function generateDeviceId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Last-resort fallback (should never run on a real device/Node 18+). Still opaque.
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Lazily resolve `expo-secure-store` so the pure helper stays Node-testable. */
async function getSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/**
 * Get the stable per-install device id, creating + persisting one on first use.
 * Falls back to a fresh (non-persisted) id if the keystore is unavailable, so history
 * calls degrade gracefully rather than crashing.
 */
export async function getDeviceId(): Promise<string> {
  try {
    const SecureStore = await getSecureStore();
    const existing = await SecureStore.getItemAsync(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.trim().length > 0) return existing;
    const fresh = generateDeviceId();
    await SecureStore.setItemAsync(DEVICE_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return generateDeviceId();
  }
}
