/**
 * Saved-dishes persistence layer for @bocado/mobile.
 *
 * Mirrors `./entitlementStorage` / `./profileStorage` exactly — two deliberately-split
 * concerns:
 *
 *   1. Serialization (`serializeSavedDishes` / `parseSavedDishes`) — PURE and
 *      node-testable. No React Native, no `expo-secure-store` import at module load.
 *      Anything malformed, empty, or non-array collapses to `[]` (never throws); each
 *      entry is validated with a guard so a single bad row drops rather than poisoning
 *      the whole list, and entries are de-duped by `menuId:dishId`.
 *
 *   2. Device storage (`loadSavedDishes` / `saveSavedDishes` / `deleteSavedDishes`) —
 *      wraps `expo-secure-store`, imported LAZILY so the pure functions stay usable in a
 *      plain Node/Vitest environment.
 *
 * PRIVACY (SECURITY.md §1 / §A): saved dishes stay FULLY ON-DEVICE. There is no server
 * endpoint, no D1 table, no `/menus` extension. A {@link SavedDishRef} stores only the
 * minimal anonymous fields needed to relist + re-open a dish (ids, the translated name,
 * the verdict level, and a timestamp) — NO nutrition, NO profile, NO health data. The
 * full dish is always re-read from the in-session menu cache on open. `deleteSavedDishes`
 * is part of the GDPR Art. 17 erasure path.
 */
import type { SuitabilityLevel } from '@bocado/shared';

/** SecureStore key. Versioned so a future schema change can co-exist / clean up. */
export const SAVED_DISHES_STORAGE_KEY = 'bocado.savedDishes.v1';

/**
 * A minimal, anonymous pointer to a saved dish. Deliberately carries NO nutrition or
 * profile data — just enough to render a list row and re-open the dish from the menu
 * cache. The verdict `level` is the menu's time-based level captured at save time
 * (it is recomputed on open anyway), used only to colour the list dot.
 */
export interface SavedDishRef {
  menuId: string;
  dishId: string;
  /** The dish's display name at save time — the only label the saved list shows. */
  translatedName: string;
  /** Verdict level captured at save time, used only for the list dot colour. */
  level: SuitabilityLevel;
  /** ISO-8601 timestamp the dish was saved, for newest-first ordering. */
  savedAt: string;
}

/** Stable composite key for a ref — the de-dupe + lookup identity. */
export function savedDishKey(menuId: string, dishId: string): string {
  return `${menuId}:${dishId}`;
}

/** The only three valid verdict levels (mirrors the shared `SuitabilityLevel`). */
function isLevel(value: unknown): value is SuitabilityLevel {
  return value === 'good' || value === 'caution' || value === 'avoid';
}

/**
 * Type guard for one persisted entry. A row missing/typed-wrong on ANY field is
 * rejected (dropped on read) rather than half-trusted, so the store never leaks a
 * malformed shape to callers.
 */
function isSavedDishRef(value: unknown): value is SavedDishRef {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.menuId === 'string' &&
    v.menuId.length > 0 &&
    typeof v.dishId === 'string' &&
    v.dishId.length > 0 &&
    typeof v.translatedName === 'string' &&
    isLevel(v.level) &&
    typeof v.savedAt === 'string' &&
    v.savedAt.length > 0
  );
}

/**
 * De-dupe a list of refs by `menuId:dishId`, keeping the FIRST occurrence (callers
 * prepend newest-first, so the most recent save wins). Pure.
 */
function dedupe(refs: SavedDishRef[]): SavedDishRef[] {
  const seen = new Set<string>();
  const out: SavedDishRef[] = [];
  for (const ref of refs) {
    const key = savedDishKey(ref.menuId, ref.dishId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/** Serialize the saved-dishes list to the exact string written to secure storage. */
export function serializeSavedDishes(refs: SavedDishRef[]): string {
  // Normalise on the way out too: only valid, de-duped rows are ever persisted.
  const clean = dedupe(refs.filter(isSavedDishRef));
  return JSON.stringify(clean);
}

/**
 * Parse a raw stored string back into a validated, de-duped list.
 *
 * Returns `[]` for `null` (nothing stored), empty/whitespace strings, non-JSON garbage,
 * a non-array value, and any value whose every entry is malformed. Individual malformed
 * entries are dropped, never thrown. Never throws.
 */
export function parseSavedDishes(raw: string | null): SavedDishRef[] {
  if (raw === null || raw.trim() === '') return [];

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(json)) return [];
  return dedupe(json.filter(isSavedDishRef));
}

/**
 * Lazily resolve `expo-secure-store`. Kept out of module scope so importing the pure
 * serialization functions never pulls a native module into a Node test run.
 */
async function getSecureStore(): Promise<typeof import('expo-secure-store')> {
  return import('expo-secure-store');
}

/** Read + validate the stored list. Absent or invalid data yields `[]`. */
export async function loadSavedDishes(): Promise<SavedDishRef[]> {
  try {
    const SecureStore = await getSecureStore();
    const raw = await SecureStore.getItemAsync(SAVED_DISHES_STORAGE_KEY);
    return parseSavedDishes(raw);
  } catch {
    // Storage unavailable (e.g. keystore locked) — fail safe to an empty list.
    return [];
  }
}

/** Persist the saved-dishes list to the device secure keystore. Best-effort; never throws. */
export async function saveSavedDishes(refs: SavedDishRef[]): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.setItemAsync(SAVED_DISHES_STORAGE_KEY, serializeSavedDishes(refs));
  } catch {
    // Non-fatal: an unwritable keystore must not break the in-memory list.
  }
}

/**
 * GDPR Art. 17 erasure: remove the stored saved-dishes list from the device entirely.
 * Best-effort for the same reason as {@link saveSavedDishes}.
 */
export async function deleteSavedDishes(): Promise<void> {
  try {
    const SecureStore = await getSecureStore();
    await SecureStore.deleteItemAsync(SAVED_DISHES_STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}
