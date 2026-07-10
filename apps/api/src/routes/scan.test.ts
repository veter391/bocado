/**
 * Tests for POST /scan — the anonymous edge over the deterministic engine.
 *
 * The perception layer is MOCKED at the module boundary (`../perception/client`)
 * so these tests NEVER hit the network and never need a real API key (SECURITY.md:
 * "No real API keys/network in tests — use mocks"). We drive the route with Hono's
 * `app.request()` and assert the contract, not exact nutrition figures (the seed
 * table's numbers will shift when the real CIQUAL/USDA data lands).
 *
 * What we assert:
 *  - 200 + a well-formed ScannedMenu for a normal scan.
 *  - Each dish carries a nutrition RANGE, a suitability verdict, and honest
 *    "may contain" allergen handling — and the word "safe" appears NOWHERE.
 *  - A body carrying `profile` (or `allergies` / `userId`) is REJECTED 400 — the
 *    anonymity invariant is enforced at the boundary.
 *  - An empty-menu photo is a valid 200 with `dishes: []` and a hint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerceivedMenu, ScannedMenu } from '@bocado/shared';

// --- Mock the perception client BEFORE importing the route ------------------
// A factory mock means the real `../perception/client` module is never loaded,
// so no network/model call can happen. `vi.hoisted` defines the spy above the
// hoisted `vi.mock` factory so it can be referenced inside it (and asserted on below).
const { perceiveMenu } = vi.hoisted(() => ({ perceiveMenu: vi.fn() }));
vi.mock('../perception/client', async () => {
  // Keep the REAL isLowMenuConfidence (a pure helper the route imports) so the non-menu
  // gate is exercised end-to-end; only the network-touching perceiveMenu is mocked.
  const actual = await vi.importActual<typeof import('../perception/client')>(
    '../perception/client',
  );
  return { ...actual, perceiveMenu };
});

// Imported AFTER vi.mock so the route picks up the mocked client.
import { scanRoute } from './scan';
import type { Env } from '../env';
import { envWithD1, makeFakeD1, type FakeD1 } from '../test/fakeD1';

/**
 * A small, deterministic perceived menu: grilled chicken + fries + olive oil.
 * Chicken/fries/oil all exist in the nutrition seed table, so the engine yields
 * real ranges + sources rather than an all-unknown low-confidence estimate.
 */
const FIXTURE_MENU: PerceivedMenu = {
  title: 'La Taberna',
  dishes: [
    {
      originalText: 'Pollo a la plancha con patatas fritas',
      translatedName: 'Grilled chicken with fries',
      section: 'Main courses',
      explanation: 'Grilled chicken breast served with a side of fried potatoes.',
      ingredients: [
        { name: 'chicken', grams: 160 },
        { name: 'french fries', grams: 130 },
        { name: 'olive oil', grams: 10 },
      ],
    },
  ],
};

/** Minimal data: URL — the route only checks the `data:` prefix; perception is mocked. */
const IMAGE_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

/**
 * A per-test Env carrying a FAKE D1 (the route now consults the anonymous perception
 * cache). Perception itself is mocked and the deterministic engine takes no bindings,
 * so the only binding exercised here is `DB`. A fresh fake is built in `beforeEach`.
 */
let fakeD1: FakeD1;
let TEST_ENV: Env;

/** POST JSON to the route under test. */
async function post(body: unknown): Promise<Response> {
  return scanRoute.request(
    '/',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    TEST_ENV,
  );
}

/** Recursively assert the literal string "safe" appears in no string value. */
function assertNoSafeClaim(value: unknown): void {
  if (typeof value === 'string') {
    expect(value.toLowerCase()).not.toContain('safe');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoSafeClaim(item);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) assertNoSafeClaim(v);
  }
}

beforeEach(() => {
  perceiveMenu.mockReset();
  fakeD1 = makeFakeD1();
  TEST_ENV = envWithD1(fakeD1);
});

describe('POST /scan — happy path (chicken + fries + olive oil)', () => {
  beforeEach(() => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
  });

  it('returns 200 with a well-formed ScannedMenu', async () => {
    const res = await post({ image: IMAGE_DATA_URL, locale: 'en', context: 'lunch' });
    expect(res.status).toBe(200);

    const menu = (await res.json()) as ScannedMenu;
    expect(typeof menu.id).toBe('string');
    expect(menu.id.length).toBeGreaterThan(0);
    // createdAt is a valid ISO timestamp.
    expect(Number.isNaN(Date.parse(menu.createdAt))).toBe(false);
    expect(menu.context).toBe('lunch');
    expect(menu.title).toBe('La Taberna');
    expect(Array.isArray(menu.dishes)).toBe(true);
    expect(menu.dishes).toHaveLength(1);
  });

  it('forwards only the image + locale to perception (anonymous call)', async () => {
    await post({ image: IMAGE_DATA_URL, locale: 'es' });
    expect(perceiveMenu).toHaveBeenCalledTimes(1);
    const [images, , opts] = perceiveMenu.mock.calls[0]!;
    // A single-image scan is forwarded as a one-element page list (multi-page contract).
    expect(images).toEqual([IMAGE_DATA_URL]);
    // Options carry ONLY a UI locale — never identity/allergies/profile.
    expect(opts).toEqual({ locale: 'es' });
    expect(Object.keys(opts as object)).toEqual(['locale']);
  });

  it('gives each dish a nutrition range, a suitability verdict, and allergen flags', async () => {
    const res = await post({ image: IMAGE_DATA_URL, context: 'dinner' });
    const menu = (await res.json()) as ScannedMenu;
    const dish = menu.dishes[0]!;

    // Identity / perception-plane fields preserved.
    expect(dish.id).toContain('pollo');
    expect(dish.originalText).toBe('Pollo a la plancha con patatas fritas');
    expect(dish.translatedName).toBe('Grilled chicken with fries');
    expect(dish.section).toBe('Main courses');

    // Nutrition is a RANGE (min <= max, with a unit), never a hard number.
    expect(dish.nutrition).toBeDefined();
    const { kcal, protein, fat, salt } = dish.nutrition!;
    for (const range of [kcal, protein, fat, salt]) {
      expect(typeof range.unit).toBe('string');
      expect(range.unit.length).toBeGreaterThan(0);
      expect(range.min).toBeGreaterThanOrEqual(0);
      expect(range.max).toBeGreaterThanOrEqual(range.min);
    }
    expect(kcal.unit).toBe('kcal');
    // Real ingredients -> traced sources -> better-than-'low' confidence.
    expect(dish.nutrition!.sources.length).toBeGreaterThan(0);
    expect(dish.nutrition!.confidence).not.toBe('low');

    // Suitability verdict present and explainable, with NO profile influence.
    expect(['good', 'caution', 'avoid']).toContain(dish.suitability.level);
    expect(dish.suitability.label.length).toBeGreaterThan(0);
    expect(dish.suitability.reasons.length).toBeGreaterThan(0);

    // Allergen handling is honest: it's an array; any flag is "may contain",
    // basis is ingredient-match, and never the word "safe".
    expect(Array.isArray(dish.allergenFlags)).toBe(true);
    for (const flag of dish.allergenFlags) {
      expect(flag.basis).toBe('ingredient-match');
      expect(flag.note.toLowerCase()).toContain('confirm');
      expect(flag.note.toLowerCase()).not.toContain('safe');
    }
    // A chicken/fries/oil dish has no dairy -> must not falsely flag milk.
    expect(dish.allergenFlags.map((f) => f.allergen)).not.toContain('milk');
  });

  it('never asserts a dish is "safe" anywhere in the response', async () => {
    const res = await post({ image: IMAGE_DATA_URL });
    const menu = await res.json();
    assertNoSafeClaim(menu);
  });

  it('derives the meal context from the clock when none is provided', async () => {
    const res = await post({ image: IMAGE_DATA_URL });
    const menu = (await res.json()) as ScannedMenu;
    expect(['breakfast', 'lunch', 'dinner', 'late-night', 'snack']).toContain(menu.context);
  });
});

describe('POST /scan — anonymity guard (no personal data at the boundary)', () => {
  it('rejects a body carrying a profile with 400 and does NOT call perception', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const res = await post({
      image: IMAGE_DATA_URL,
      profile: { diet: 'vegan', allergies: ['milk'], goals: ['balanced'] },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('profile');
    // The forbidden body must be rejected BEFORE any model call.
    expect(perceiveMenu).not.toHaveBeenCalled();
  });

  it('rejects a body carrying allergies with 400', async () => {
    const res = await post({ image: IMAGE_DATA_URL, allergies: ['peanuts'] });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('allergies');
  });

  it('rejects a body carrying a userId with 400', async () => {
    const res = await post({ image: IMAGE_DATA_URL, userId: 'user_123' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('userid');
  });

  it('rejects any other unexpected key (strict schema)', async () => {
    const res = await post({ image: IMAGE_DATA_URL, location: 'Madrid' });
    expect(res.status).toBe(400);
  });
});

describe('POST /scan — input validation', () => {
  it('rejects a non-data-URL image with 400', async () => {
    const res = await post({ image: 'https://example.com/menu.jpg' });
    expect(res.status).toBe(400);
    expect(perceiveMenu).not.toHaveBeenCalled();
  });

  it('rejects a missing image with 400', async () => {
    const res = await post({ locale: 'en' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON body with 400', async () => {
    const res = await scanRoute.request(
      '/',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' },
      TEST_ENV,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /scan — perception failure', () => {
  it('returns 502 with a friendly, non-leaky message when perception throws', async () => {
    perceiveMenu.mockRejectedValue(new Error('OpenRouter 503 upstream timeout'));
    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error.length).toBeGreaterThan(0);
    // The friendly message must not leak upstream/model internals.
    expect(body.error.toLowerCase()).not.toContain('openrouter');
    expect(body.error).not.toContain('503');
  });
});

describe('POST /scan — perception cache (D1)', () => {
  it('MISS then HIT: calls the model once, caches it, and serves the cache next time', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);

    // First scan: cache miss -> model called -> result written to perception_cache.
    const first = await post({ image: IMAGE_DATA_URL, context: 'lunch' });
    expect(first.status).toBe(200);
    expect(perceiveMenu).toHaveBeenCalledTimes(1);
    expect(fakeD1.perception.size).toBe(1);

    // Second scan of the SAME image: cache hit -> model NOT called again.
    const second = await post({ image: IMAGE_DATA_URL, context: 'lunch' });
    expect(second.status).toBe(200);
    expect(perceiveMenu).toHaveBeenCalledTimes(1);

    // Both responses describe the same menu (title + dish count).
    const a = (await first.json()) as ScannedMenu;
    const b = (await second.json()) as ScannedMenu;
    expect(b.title).toBe(a.title);
    expect(b.dishes).toHaveLength(a.dishes.length);
  });

  it('a different image is a separate cache key (model called again)', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);

    await post({ image: IMAGE_DATA_URL });
    await post({ image: 'data:image/png;base64,DIFFERENTBYTES==' });

    expect(perceiveMenu).toHaveBeenCalledTimes(2);
    expect(fakeD1.perception.size).toBe(2);
  });

  it('does NOT cache when perception fails (502)', async () => {
    perceiveMenu.mockRejectedValue(new Error('upstream down'));
    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(502);
    expect(fakeD1.perception.size).toBe(0);
  });
});

describe('POST /scan — USDA-FDC fallback (key-gated, injected via global fetch stub)', () => {
  /** A perceived menu whose ingredient cannot be resolved by the baked-in table. */
  const LONGTAIL_MENU: PerceivedMenu = {
    title: 'Izakaya',
    dishes: [
      {
        originalText: 'Mochi',
        translatedName: 'Mochi',
        cookingMethod: 'steamed',
        ingredients: [{ canonicalName: 'kkakdugi longtail xyz', grams: 150 }],
      } as PerceivedMenu['dishes'][number],
    ],
  };

  const FDC_OK = JSON.stringify({
    foods: [
      {
        fdcId: 167512,
        description: 'Mochi',
        dataType: 'SR Legacy',
        foodCategoryId: 18,
        foodNutrients: [
          { nutrientId: 1008, value: 250 },
          { nutrientId: 1003, value: 4 },
          { nutrientId: 1004, value: 1 },
          { nutrientId: 1093, value: 100 },
        ],
      },
    ],
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('key ABSENT: fallback skipped, unknown stays unmatched, no FDC call', async () => {
    perceiveMenu.mockResolvedValue(LONGTAIL_MENU);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(200);
    const menu = (await res.json()) as ScannedMenu;
    // No key -> no FDC HTTP call; the long-tail ingredient resolves to nothing,
    // so confidence is low and sources is empty (honest unmatched).
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(menu.dishes[0]!.nutrition!.confidence).toBe('low');
    expect(menu.dishes[0]!.nutrition!.sources).toHaveLength(0);
    expect(fakeD1.usdaFoods.size).toBe(0);
  });

  it('key PRESENT: resolves the unknown via FDC (db:"API"), caches it, scan succeeds', async () => {
    perceiveMenu.mockResolvedValue(LONGTAIL_MENU);
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => FDC_OK,
    }));
    vi.stubGlobal('fetch', fetchSpy);
    TEST_ENV = envWithD1(fakeD1, { FDC_API_KEY: 'test-fdc-key' });

    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(200);
    const menu = (await res.json()) as ScannedMenu;
    // The FDC fallback resolved the long-tail food -> a db:'API' source appears.
    const sources = menu.dishes[0]!.nutrition!.sources;
    expect(sources.some((s) => s.db === 'API')).toBe(true);
    // It was cached in the usda_food_cache table.
    expect(fakeD1.usdaFoods.size).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // db:'API' is lower-trust -> never reported as 'high' confidence.
    expect(menu.dishes[0]!.nutrition!.confidence).not.toBe('high');
  });

  it('key PRESENT but FDC unreachable: scan still succeeds, ingredient stays unmatched', async () => {
    perceiveMenu.mockResolvedValue(LONGTAIL_MENU);
    const fetchSpy = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubGlobal('fetch', fetchSpy);
    TEST_ENV = envWithD1(fakeD1, { FDC_API_KEY: 'test-fdc-key' });

    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(200); // the scan must not fail because the fallback failed
    const menu = (await res.json()) as ScannedMenu;
    expect(menu.dishes[0]!.nutrition!.sources).toHaveLength(0);
  });
});

describe('POST /scan — rate limit (cost floor, keyed on X-Device-Id)', () => {
  const DEVICE = 'scan-device-12345678';

  /** POST under a device header so the limiter has a key. */
  async function postAs(body: unknown, deviceId: string): Promise<Response> {
    return scanRoute.request(
      '/',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Device-Id': deviceId },
        body: JSON.stringify(body),
      },
      TEST_ENV,
    );
  }

  it('allows a normal scan when no limit is configured', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const res = await postAs({ image: IMAGE_DATA_URL }, DEVICE);
    expect(res.status).toBe(200);
  });

  it('429s the over-cap scan with Retry-After and does NOT re-call perception', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    TEST_ENV = envWithD1(fakeD1, { SCAN_RATE_LIMIT: '1' });

    const first = await postAs({ image: IMAGE_DATA_URL }, DEVICE);
    expect(first.status).toBe(200);
    expect(perceiveMenu).toHaveBeenCalledTimes(1);

    const second = await postAs({ image: IMAGE_DATA_URL }, DEVICE);
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The blocked request never reached the (billed) model.
    expect(perceiveMenu).toHaveBeenCalledTimes(1);
  });

  it('isolates the counter per device id', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    TEST_ENV = envWithD1(fakeD1, { SCAN_RATE_LIMIT: '1' });

    expect((await postAs({ image: IMAGE_DATA_URL }, DEVICE)).status).toBe(200);
    expect((await postAs({ image: IMAGE_DATA_URL }, DEVICE)).status).toBe(429);
    // A different device still gets its own allowance.
    expect((await postAs({ image: IMAGE_DATA_URL }, 'other-scan-device-1')).status).toBe(200);
  });

  it('FAILS OPEN: a throwing counter store still lets the scan through', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const throwingDb = {
      prepare(sql: string) {
        if (sql.toLowerCase().includes('rate_limit_counters')) {
          throw new Error('D1 unavailable');
        }
        return fakeD1.db.prepare(sql);
      },
    } as unknown as D1Database;
    TEST_ENV = envWithD1(fakeD1, { SCAN_RATE_LIMIT: '1', DB: throwingDb });

    const res = await postAs({ image: IMAGE_DATA_URL }, DEVICE);
    expect(res.status).toBe(200);
  });

  // Regression: omitting X-Device-Id used to skip the limiter entirely (cost-abuse
  // bypass). It must now fall back to the hashed client IP and still cap.
  it('still caps when X-Device-Id is OMITTED, falling back to the client IP', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    TEST_ENV = envWithD1(fakeD1, { SCAN_RATE_LIMIT: '1' });

    const headerlessFromIp = async (ip: string): Promise<Response> =>
      scanRoute.request(
        '/',
        {
          method: 'POST',
          // No X-Device-Id — only the Cloudflare-injected client IP.
          headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip },
          body: JSON.stringify({ image: IMAGE_DATA_URL }),
        },
        TEST_ENV,
      );

    expect((await headerlessFromIp('203.0.113.7')).status).toBe(200);
    // Second call from the SAME ip is capped even though no device header was sent.
    expect((await headerlessFromIp('203.0.113.7')).status).toBe(429);
    // A different IP keeps its own allowance (per-key isolation via the hash).
    expect((await headerlessFromIp('203.0.113.8')).status).toBe(200);
  });
});

describe('POST /scan — payload size cap (cost-amplification guard)', () => {
  it('rejects an oversized image data: URL with 400 and never calls perception', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    // > MAX_IMAGE_CHARS (3.5M) — a multi-megabyte payload a real cleaned photo never is.
    const huge = `data:image/jpeg;base64,${'A'.repeat(3_600_000)}`;
    const res = await post({ image: huge, locale: 'en' });
    expect(res.status).toBe(400);
    expect(perceiveMenu).not.toHaveBeenCalled();
  });
});

describe('POST /scan — empty menu', () => {
  it('returns 200 with dishes: [] and a hint when the photo has no dishes', async () => {
    perceiveMenu.mockResolvedValue({ dishes: [] } satisfies PerceivedMenu);
    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScannedMenu & { hint?: string; notMenu?: boolean };
    expect(body.dishes).toEqual([]);
    expect(typeof body.hint).toBe('string');
    expect(body.hint!.length).toBeGreaterThan(0);
    // No menu signal -> a generic empty result, not a "not a menu" rejection.
    expect(body.notMenu).toBe(false);
    // Still a valid ScannedMenu shape.
    expect(typeof body.id).toBe('string');
    expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
  });
});

describe('POST /scan — non-menu / low-confidence (never fabricate dishes)', () => {
  it('flags notMenu=true with a clear hint when menuConfidence is low and no dishes', async () => {
    perceiveMenu.mockResolvedValue({
      dishes: [],
      menuConfidence: 0.1,
      isMenu: false,
    } satisfies PerceivedMenu);
    const res = await post({ image: IMAGE_DATA_URL });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScannedMenu & { hint?: string; notMenu?: boolean };
    expect(body.dishes).toEqual([]);
    expect(body.notMenu).toBe(true);
    expect(body.hint!.toLowerCase()).toContain('menu');
    assertNoSafeClaim(body);
  });

  it('flags notMenu=true on low menuConfidence even without an explicit isMenu', async () => {
    perceiveMenu.mockResolvedValue({
      dishes: [],
      menuConfidence: 0.2,
    } satisfies PerceivedMenu);
    const res = await post({ image: IMAGE_DATA_URL });
    const body = (await res.json()) as ScannedMenu & { notMenu?: boolean };
    expect(body.notMenu).toBe(true);
  });

  it('does NOT flag notMenu when the model returned real dishes (decent read)', async () => {
    perceiveMenu.mockResolvedValue({ ...FIXTURE_MENU, menuConfidence: 0.9, isMenu: true });
    const res = await post({ image: IMAGE_DATA_URL });
    const body = (await res.json()) as ScannedMenu & { notMenu?: boolean };
    expect(body.dishes.length).toBeGreaterThan(0);
    expect(body.notMenu).toBeUndefined();
  });
});

describe('POST /scan — multi-page capture (multiple images in one call)', () => {
  it('accepts an images[] array and forwards ALL pages to perception in one call', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const pages = [IMAGE_DATA_URL, 'data:image/jpeg;base64,/9j/PAGE2=='];
    const res = await post({ images: pages, locale: 'en', context: 'lunch' });
    expect(res.status).toBe(200);
    expect(perceiveMenu).toHaveBeenCalledTimes(1);
    const [imagesArg] = perceiveMenu.mock.calls[0]!;
    expect(imagesArg).toEqual(pages);
  });

  it('a different page SET is a separate cache key (model called again)', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    await post({ images: [IMAGE_DATA_URL, 'data:image/jpeg;base64,/9j/PAGE2=='] });
    await post({ images: [IMAGE_DATA_URL, 'data:image/jpeg;base64,/9j/PAGE3=='] });
    expect(perceiveMenu).toHaveBeenCalledTimes(2);
    expect(fakeD1.perception.size).toBe(2);
  });

  it('the same single image hashes identically whether sent as image or images[1]', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    await post({ image: IMAGE_DATA_URL });
    expect(fakeD1.perception.size).toBe(1);
    // A single-element images[] of the SAME bytes must hit the existing cache row.
    const second = await post({ images: [IMAGE_DATA_URL] });
    expect(second.status).toBe(200);
    expect(perceiveMenu).toHaveBeenCalledTimes(1);
    expect(fakeD1.perception.size).toBe(1);
  });

  it('rejects more than the page cap with 400 and never calls perception', async () => {
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const tooMany = Array.from({ length: 6 }, (_, i) => `data:image/jpeg;base64,P${i}==`);
    const res = await post({ images: tooMany });
    expect(res.status).toBe(400);
    expect(perceiveMenu).not.toHaveBeenCalled();
  });

  it('rejects a body with neither image nor images with 400', async () => {
    const res = await post({ locale: 'en' });
    expect(res.status).toBe(400);
    expect(perceiveMenu).not.toHaveBeenCalled();
  });
});

describe('POST /scan — cross-page dedup (exact dups merge, distinct dishes never)', () => {
  it('collapses an exact duplicate dish across pages but keeps same-head-noun distinct dishes', async () => {
    const ing = [{ name: 'rice', grams: 120 }];
    perceiveMenu.mockResolvedValue({
      title: 'Two pages',
      dishes: [
        { originalText: 'Gazpacho andaluz', translatedName: 'Gazpacho', section: 'Starters', ingredients: ing },
        // exact duplicate from an overlapping second photo (same line + section) -> ONE
        { originalText: 'Gazpacho andaluz', translatedName: 'Gazpacho', section: 'Starters', ingredients: ing },
        // two DIFFERENT risottos sharing the head noun -> both kept (never merged)
        { originalText: 'Risotto de setas', translatedName: 'Mushroom risotto', section: 'Mains', ingredients: ing },
        { originalText: 'Risotto de marisco', translatedName: 'Seafood risotto', section: 'Mains', ingredients: ing },
      ],
    } as PerceivedMenu);

    const res = await post({ images: [IMAGE_DATA_URL, IMAGE_DATA_URL], locale: 'en', context: 'lunch' });
    expect(res.status).toBe(200);
    const menu = (await res.json()) as ScannedMenu;

    // 4 perceived -> 3 after dedup (one Gazpacho dropped).
    expect(menu.dishes).toHaveLength(3);
    const gazpacho = menu.dishes.filter((d) => d.originalText === 'Gazpacho andaluz');
    expect(gazpacho).toHaveLength(1);
    // Both distinct risottos survive (same head noun, different printed line).
    const risottos = menu.dishes.filter((d) => d.originalText.startsWith('Risotto'));
    expect(risottos).toHaveLength(2);
    // Ids stay unique after dedup.
    expect(new Set(menu.dishes.map((d) => d.id)).size).toBe(3);
  });
});
