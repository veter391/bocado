/**
 * Menu service — the device's data layer between the screens and the backend.
 *
 * Responsibilities:
 *   1. Obtain a {@link ScannedMenu} (real backend in `/scan`, or a cloned sample
 *      menu in MOCK mode so the UI is fully usable with no server).
 *   2. FINALIZE suitability ON-DEVICE. This is where the privacy invariant pays off
 *      (ARCHITECTURE.md §0, SECURITY.md §1): the server computes only time-based,
 *      profile-agnostic suitability; here we re-run the deterministic engine's
 *      `assessSuitability` with the user's LOCAL profile (diet / allergies / goals),
 *      which never left the device. A vegan profile flips a meat dish to 'avoid';
 *      a flagged allergen forces at least 'caution' with "confirm with staff".
 *   3. Cache menus in a module-level Map keyed by id, so Results / DishDetail can
 *      read by `menuId` without re-scanning.
 *
 * The engine (`@bocado/nutrition`) is PURE — no RN, no I/O, no clock — so it runs
 * fine here on-device. We pass the meal context the menu was scanned with (the
 * engine is clock-free; the context is supplied upstream from local time).
 */
import { assessSuitability } from '@bocado/nutrition';
import type { Dish, MealContext, ScannedMenu, UserProfile } from '@bocado/shared';

import { API_CONFIGURED } from '../api/config';
import {
  deleteAllMenus as clientDeleteAllMenus,
  deleteMenu as clientDeleteMenu,
  dishImageUrl,
  getMenu as fetchSavedMenu,
  listMenus,
  saveMenu,
  scanMenu,
  type MenuSummary,
} from '../api/client';
import { getDeviceId } from './deviceId';
import { sampleMenu } from '../mock/sampleMenu';

/** In-memory store of scanned menus by id. The full-menu cache backing getMenu/getDish. */
const menus = new Map<string, ScannedMenu>();

/**
 * Local history: ids of menus scanned this session, newest first. The backing store
 * for {@link listRecentMenus} in MOCK mode (no backend). Capped so it never grows
 * unbounded. In API mode history is owned by the Worker; this still mirrors recents so
 * the just-scanned menu shows instantly even before the server round-trip.
 */
const recentIds: string[] = [];
const MAX_LOCAL_RECENTS = 25;

export type { MenuSummary } from '../api/client';

/** Monotonic counter for mock menu ids — avoids Date.now/Math.random at module scope. */
let mockCounter = 0;

/** Compact a full menu into a list-friendly history summary. */
function summarize(menu: ScannedMenu): MenuSummary {
  return {
    id: menu.id,
    createdAt: menu.createdAt,
    title: menu.title,
    context: menu.context,
    dishCount: menu.dishes.length,
  };
}

/** Record a menu into the in-memory cache + the head of the local recents list. */
function remember(menu: ScannedMenu): void {
  menus.set(menu.id, menu);
  const existing = recentIds.indexOf(menu.id);
  if (existing !== -1) recentIds.splice(existing, 1);
  recentIds.unshift(menu.id);
  if (recentIds.length > MAX_LOCAL_RECENTS) {
    const dropped = recentIds.splice(MAX_LOCAL_RECENTS);
    // Keep the cache bounded too: forget the full menus that fell off the list.
    for (const id of dropped) menus.delete(id);
  }
}

/** Inputs to {@link scanAndStore} beyond the image itself. */
export interface ScanAndStoreArgs {
  /** UI display locale forwarded to the perception layer (NOT personal data). */
  locale?: string;
  /** Meal context for time-aware suitability. Forwarded to the server and the engine. */
  context?: MealContext;
  /**
   * The user's ON-DEVICE profile. Used ONLY here, locally, to finalize allergy/diet/
   * goal-aware suitability. It is NEVER forwarded to the server (privacy invariant).
   */
  profile?: UserProfile;
}

/**
 * Outcome of {@link scanAndStore}. A discriminated result so the screen can react
 * WITHOUT inventing dishes:
 *  - `notMenu`: the photo clearly wasn't a readable menu — the screen shows a calm
 *    "this doesn't look like a menu" state. No menu is stored.
 *  - `menu`: a stored {@link ScannedMenu} ready to navigate to (may legitimately have
 *    zero dishes for an empty-but-real menu, which the Results screen handles).
 */
export type ScanAndStoreResult =
  | { kind: 'menu'; menu: ScannedMenu }
  | { kind: 'notMenu'; hint?: string };

/**
 * Deep-clone a menu so on-device refinement never mutates the shared sample (or a
 * server response object the caller might still hold). `structuredClone` is available
 * in the RN/Hermes runtime and in Node 18+ (so tests use it too).
 */
function cloneMenu(menu: ScannedMenu): ScannedMenu {
  return structuredClone(menu);
}

/**
 * Re-run the deterministic engine over each dish with the LOCAL profile and attach
 * image URLs. Mutates the (already-cloned) dish objects in place.
 *
 * - Suitability: recomputed whenever the dish has nutrition, joining the on-device
 *   profile to the anonymous nutrition + ingredients the server (or mock) produced.
 *   This is the single point where allergies/diet influence the verdict — and it
 *   happens entirely on-device.
 * - Image: in API mode, dishes without an image get the lazy /image URL (marked AI).
 *   In MOCK mode we leave the sample's own image fields untouched (no image server).
 */
function refineDish(dish: Dish, context: MealContext, profile?: UserProfile): void {
  if (dish.nutrition) {
    dish.suitability = assessSuitability({
      nutrition: dish.nutrition,
      context,
      profile,
      ingredients: dish.ingredients,
    });
  }

  if (API_CONFIGURED && !dish.imageUrl) {
    dish.imageUrl = dishImageUrl(dish.translatedName);
    dish.imageIsAi = true;
  }
}

/**
 * Obtain a menu for one or more cleaned page images, finalize it on-device, store it,
 * and return a {@link ScanAndStoreResult}.
 *
 * In API mode this POSTs the cleaned page(s) to `/scan` (multiple pages in ONE call) and,
 * when the edge flags the photo as clearly NOT a menu, returns `{ kind: 'notMenu' }`
 * WITHOUT storing anything — the screen shows a calm "try again" state rather than
 * fabricated dishes. In MOCK mode it clones the bundled sample menu under a fresh id.
 * Either way, every dish's suitability is recomputed locally with `args.profile` before
 * the menu is cached.
 *
 * @param imageDataUrls one cleaned `data:` URL, or several pages of the SAME menu.
 * @throws re-throws the {@link ApiError} from {@link scanMenu} on backend failure so
 *         the screen can show an inline error + retry.
 */
export async function scanAndStore(
  imageDataUrls: string | readonly string[],
  args: ScanAndStoreArgs,
): Promise<ScanAndStoreResult> {
  let menu: ScannedMenu;

  if (API_CONFIGURED) {
    const result = await scanMenu(imageDataUrls, {
      locale: args.locale,
      context: args.context,
    });
    // Honest non-menu state: the photo wasn't a readable menu. Do NOT store or
    // navigate to an empty/fabricated menu — let the screen show "try again".
    if (result.notMenu) {
      return { kind: 'notMenu', hint: result.hint };
    }
    // Clone so refinement never mutates a response object the caller may still hold.
    menu = cloneMenu(result.menu);
  } else {
    // MOCK mode: clone the sample under a fresh, collision-free id.
    mockCounter += 1;
    menu = cloneMenu(sampleMenu);
    menu.id = `${sampleMenu.id}-${mockCounter}`;
    if (args.context !== undefined) menu.context = args.context;
  }

  for (const dish of menu.dishes) {
    refineDish(dish, menu.context, args.profile);
  }

  remember(menu);

  // In API mode, also persist to the device's server-side history (best-effort: a
  // failed save must never break the just-completed scan, and it is fire-and-forget so
  // it does not delay navigation to Results). The menu is already anonymous.
  if (API_CONFIGURED) {
    void getDeviceId()
      .then((deviceId) => saveMenu(menu, deviceId))
      .catch(() => {
        /* history is non-critical; the local recents list still has it */
      });
  }

  return { kind: 'menu', menu };
}

/**
 * Delete one menu from the device's history (GDPR Art. 17).
 *
 * Always drops it from the in-memory cache + local recents (so the UI updates
 * immediately in BOTH modes). In API mode it ALSO best-effort tells the Worker to
 * erase the device-scoped server copy — fire-and-forget, mirroring `scanAndStore`'s
 * save: a failed delete (offline, already gone) must never throw to the caller, since
 * the local copy is already removed. In MOCK mode this is purely in-memory (no network).
 */
export async function deleteMenu(id: string): Promise<void> {
  menus.delete(id);
  const idx = recentIds.indexOf(id);
  if (idx !== -1) recentIds.splice(idx, 1);

  if (API_CONFIGURED) {
    await getDeviceId()
      .then((deviceId) => clientDeleteMenu(id, deviceId))
      .catch(() => {
        /* the local copy is already removed; server erasure is best-effort */
      });
  }
}

/**
 * Clear the ENTIRE scan history (GDPR Art. 17 "clear scan history").
 *
 * Empties the local recents list + the full-menu cache in BOTH modes. In API mode it
 * ALSO best-effort tells the Worker to erase the device's server-side history. MOCK
 * mode operates purely on the in-memory recents (no network).
 */
export async function clearHistory(): Promise<void> {
  recentIds.length = 0;
  menus.clear();

  if (API_CONFIGURED) {
    await getDeviceId()
      .then((deviceId) => clientDeleteAllMenus(deviceId))
      .catch(() => {
        /* local history is already cleared; server erasure is best-effort */
      });
  }
}

/** Look up a stored menu by id. Returns undefined if it was never scanned/stored. */
export function getMenu(id: string): ScannedMenu | undefined {
  return menus.get(id);
}

/** Look up a single dish within a stored menu. Undefined if either id is unknown. */
export function getDish(menuId: string, dishId: string): Dish | undefined {
  return menus.get(menuId)?.dishes.find((d) => d.id === dishId);
}

/**
 * List recently-scanned menus, newest first, as compact summaries for the history UI.
 *
 * - API mode: read the device's server-side history (`/menus`), merged with any
 *   locally-remembered recents (so a just-scanned menu shows even before its save
 *   round-trips). Falls back to local-only if the server call fails.
 * - MOCK mode: the in-memory local recents list (this session only).
 */
export async function listRecentMenus(): Promise<MenuSummary[]> {
  const local = recentIds
    .map((id) => menus.get(id))
    .filter((m): m is ScannedMenu => m !== undefined)
    .map(summarize);

  if (!API_CONFIGURED) return local;

  try {
    const deviceId = await getDeviceId();
    const remote = await listMenus(deviceId);
    // Merge: prefer server rows, then add local-only ones; de-dupe by id; newest first.
    const byId = new Map<string, MenuSummary>();
    for (const s of remote) byId.set(s.id, s);
    for (const s of local) if (!byId.has(s.id)) byId.set(s.id, s);
    return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return local;
  }
}

/**
 * Ensure a menu is in the local cache (so the synchronous {@link getMenu} the Results
 * screen uses can read it) and return it. Used when opening a menu from history.
 *
 * Returns a cached menu immediately; in API mode, fetches + caches it from the device's
 * server-side history on a miss. Returns undefined if it cannot be found.
 */
export async function loadMenu(id: string): Promise<ScannedMenu | undefined> {
  const cached = menus.get(id);
  if (cached) return cached;
  if (!API_CONFIGURED) return undefined;
  try {
    const deviceId = await getDeviceId();
    const menu = await fetchSavedMenu(id, deviceId);
    remember(menu);
    return menu;
  } catch {
    return undefined;
  }
}
