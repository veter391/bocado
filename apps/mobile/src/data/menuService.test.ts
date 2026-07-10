/**
 * Unit tests for the on-device menu service in MOCK mode (no backend configured).
 *
 * These tests prove the two things that matter most for correctness + compliance:
 *   1. `scanAndStore` returns a menu that `getMenu`/`getDish` can then read back.
 *   2. Suitability is RE-COMPUTED on-device from the LOCAL profile — a vegan profile
 *      flips a meat dish (grilled chicken) away from 'good' to 'avoid'. This is the
 *      privacy invariant in action: the profile never goes to the server; the verdict
 *      is finalized here.
 *   3. NO output ever contains the word "safe" (SECURITY.md §2.B — never claim a dish
 *      is safe/allergen-free; only "may contain — confirm with staff").
 *
 * NODE-only: imports the service + shared types + the sample id. It imports NO React
 * Native component/screen. MOCK mode is guaranteed by leaving EXPO_PUBLIC_API_BASE_URL
 * unset (the config module then resolves API_CONFIGURED === false). We assert that
 * precondition explicitly so the test fails loudly if the env ever leaks in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannedMenu, UserProfile } from '@bocado/shared';

import { SAMPLE_MENU_ID } from '../mock/sampleMenu';
import type { ScanAndStoreResult } from './menuService';

const IMAGE = 'data:image/jpeg;base64,MOCKPLACEHOLDER';

/**
 * Unwrap the discriminated {@link ScanAndStoreResult} to the stored menu, failing the
 * test if the result was the non-menu branch. In MOCK mode scanAndStore always yields a
 * menu (no edge signal), so this is a thin assertion that keeps the menu-shape tests
 * focused on the menu while still type-narrowing.
 */
function expectMenu(result: ScanAndStoreResult): ScannedMenu {
  expect(result.kind).toBe('menu');
  if (result.kind !== 'menu') throw new Error('expected a menu result');
  return result.menu;
}

/** A vegan profile with explicit consent (so allergies could be set if any). */
const VEGAN: UserProfile = {
  diet: 'vegan',
  allergies: [],
  goals: [],
  consentHealthDataAt: '2026-06-16T12:00:00.000Z',
};

/** Recursively collect every string value in a menu, for content assertions. */
function allStrings(menu: ScannedMenu): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      out.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(walk);
    }
  };
  walk(menu);
  return out;
}

beforeEach(() => {
  // Guarantee MOCK mode: the backend must NOT be configured for these tests.
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('menuService — MOCK mode', () => {
  it('is genuinely running in mock mode (API not configured)', async () => {
    const { API_CONFIGURED } = await import('../api/config');
    expect(API_CONFIGURED).toBe(false);
  });

  it('scanAndStore returns a stored menu retrievable by getMenu/getDish', async () => {
    const { scanAndStore, getMenu, getDish } = await import('./menuService');

    const menu = expectMenu(await scanAndStore(IMAGE, { profile: undefined }));

    // Fresh, collision-free id derived from the sample id (not the bare sample id).
    expect(menu.id).toContain(SAMPLE_MENU_ID);
    expect(menu.id).not.toBe(SAMPLE_MENU_ID);
    expect(menu.dishes.length).toBeGreaterThan(0);

    // It is actually stored and readable.
    expect(getMenu(menu.id)).toBe(menu);
    const firstDish = menu.dishes[0];
    expect(firstDish).toBeDefined();
    if (firstDish) {
      expect(getDish(menu.id, firstDish.id)).toBe(firstDish);
    }
    expect(getMenu('does-not-exist')).toBeUndefined();
    expect(getDish(menu.id, 'no-such-dish')).toBeUndefined();
  });

  it('re-computes suitability with the LOCAL profile: vegan flips grilled chicken to avoid', async () => {
    const { scanAndStore } = await import('./menuService');

    // Baseline (no profile): the grilled chicken dish reads 'good' in the sample.
    const baseline = expectMenu(await scanAndStore(IMAGE, {}));
    const baseChicken = baseline.dishes.find((d) => d.id === 'dish-pollo-griglia');
    expect(baseChicken?.suitability.level).toBe('good');

    // With a vegan profile, the on-device re-run must downgrade it away from 'good'.
    const vegan = expectMenu(await scanAndStore(IMAGE, { profile: VEGAN }));
    const veganChicken = vegan.dishes.find((d) => d.id === 'dish-pollo-griglia');
    expect(veganChicken).toBeDefined();
    expect(veganChicken?.suitability.level).not.toBe('good');
    expect(veganChicken?.suitability.level).toBe('avoid');
    // The reason is a plain, factual category statement (not a health claim).
    expect(veganChicken?.suitability.label).toBe('Not vegan');

    // The two scans are independent stored copies — refining one never mutated the other.
    expect(baseChicken?.suitability.level).toBe('good');
  });

  it('never emits the word "safe" anywhere in a refined menu (any profile)', async () => {
    const { scanAndStore } = await import('./menuService');

    for (const profile of [undefined, VEGAN]) {
      const menu = expectMenu(await scanAndStore(IMAGE, { profile }));
      for (const text of allStrings(menu)) {
        expect(text.toLowerCase()).not.toContain('safe');
      }
    }
  });

  it('does not attach AI image URLs in mock mode (no image server)', async () => {
    const { scanAndStore } = await import('./menuService');
    const menu = expectMenu(await scanAndStore(IMAGE, {}));

    // Dishes that had no image in the sample must STILL have none (we never call
    // dishImageUrl in mock mode). Dishes that were AI-illustrated in the sample keep
    // their own fields untouched.
    const plain = menu.dishes.find((d) => d.id === 'dish-pollo-griglia');
    expect(plain?.imageUrl).toBeUndefined();
    const ai = menu.dishes.find((d) => d.id === 'dish-carbonara');
    expect(ai?.imageUrl).toBe('https://images.bocado.invalid/ai/carbonara.png');
    expect(ai?.imageIsAi).toBe(true);
  });

  it('records scanned menus into local history (newest first) and loadMenu reads them', async () => {
    const { scanAndStore, listRecentMenus, loadMenu } = await import('./menuService');

    const first = expectMenu(await scanAndStore(IMAGE, {}));
    const second = expectMenu(await scanAndStore(IMAGE, {}));

    const recents = await listRecentMenus();
    // Both appear, newest (the second scan) ahead of the first.
    const ids = recents.map((r) => r.id);
    expect(ids).toContain(first.id);
    expect(ids).toContain(second.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));

    // Summaries are compact + correct.
    const summary = recents.find((r) => r.id === second.id);
    expect(summary?.dishCount).toBe(second.dishes.length);
    expect(summary?.context).toBe(second.context);

    // loadMenu resolves a known menu from the local cache.
    await expect(loadMenu(second.id)).resolves.toBe(second);
    // An unknown id in mock mode resolves to undefined (no remote to fall back to).
    await expect(loadMenu('totally-unknown-id')).resolves.toBeUndefined();
  });

  it('deleteMenu drops one menu from history + cache while the others survive (no fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { scanAndStore, deleteMenu, listRecentMenus, getMenu } = await import('./menuService');

    const first = expectMenu(await scanAndStore(IMAGE, {}));
    const second = expectMenu(await scanAndStore(IMAGE, {}));

    await deleteMenu(first.id);

    const ids = (await listRecentMenus()).map((r) => r.id);
    expect(ids).not.toContain(first.id);
    expect(ids).toContain(second.id);
    // The full-menu cache evicted the deleted one; the survivor is still readable.
    expect(getMenu(first.id)).toBeUndefined();
    expect(getMenu(second.id)).toBe(second);
    // MOCK mode never touches the network.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clearHistory empties recents + evicts the cache (no fetch)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { scanAndStore, clearHistory, listRecentMenus, getMenu } = await import('./menuService');

    const first = expectMenu(await scanAndStore(IMAGE, {}));
    const second = expectMenu(await scanAndStore(IMAGE, {}));

    await clearHistory();

    expect(await listRecentMenus()).toEqual([]);
    expect(getMenu(first.id)).toBeUndefined();
    expect(getMenu(second.id)).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
