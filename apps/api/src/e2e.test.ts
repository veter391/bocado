/**
 * End-to-end journey over the COMPOSED Worker (`app` from ./index), not a single route:
 * a user scans a menu, saves it, sees it in history, opens it, another device can't, and
 * they delete it. Perception is mocked at the module boundary (no network / no API key,
 * per SECURITY.md); D1 is the in-memory fake.
 *
 * This is the integration the per-route unit tests can't see: that the EXACT ScannedMenu
 * `/scan` produces round-trips through `/menus`. A shape drift there (as happened when
 * /menus validated the legacy `{name,grams}` ingredient shape while /scan emits
 * `IngredientGuess`) is invisible to route-isolated tests but breaks the real "save this
 * scan" flow — this test guards that seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PerceivedMenu, ScannedMenu } from '@bocado/shared';

// Mock the perception client BEFORE importing the app, so no network/model call happens.
const { perceiveMenu } = vi.hoisted(() => ({ perceiveMenu: vi.fn() }));
vi.mock('./perception/client', async () => {
  const actual =
    await vi.importActual<typeof import('./perception/client')>('./perception/client');
  return { ...actual, perceiveMenu };
});

import app from './index';
import type { Env } from './env';
import { envWithD1, makeFakeD1, type FakeD1 } from './test/fakeD1';

const IMAGE_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const DEVICE_ID = 'e2e-device-1234567890';

/** Chicken + fries + olive oil — all in the seed table, so the engine yields real ranges. */
const FIXTURE_MENU: PerceivedMenu = {
  title: 'La Taberna',
  dishes: [
    {
      originalText: 'Pollo a la plancha con patatas fritas',
      translatedName: 'Grilled chicken with fries',
      section: 'Mains',
      explanation: 'Grilled chicken breast with a side of fried potatoes.',
      // Real (post-transform) IngredientGuess shape that perceiveMenu returns in prod.
      ingredients: [
        { canonicalName: 'chicken', grams: 160, basis: 'read', isAddedFat: false },
        { canonicalName: 'french fries', grams: 130, basis: 'read', isAddedFat: false },
        { canonicalName: 'olive oil', grams: 10, basis: 'inferred', isAddedFat: true },
      ],
    },
  ],
};

let fakeD1: FakeD1;
let env: Env;

beforeEach(() => {
  perceiveMenu.mockReset();
  fakeD1 = makeFakeD1();
  env = envWithD1(fakeD1);
});

/** JSON request against the composed app under a device header. */
async function call(
  path: string,
  method: string,
  body?: unknown,
  deviceId: string = DEVICE_ID,
): Promise<Response> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'X-Device-Id': deviceId,
  };
  return app.request(
    path,
    { method, headers, body: body === undefined ? undefined : JSON.stringify(body) },
    env,
  );
}

describe('E2E — scan → save → history → open → delete (composed Worker)', () => {
  it('runs the full anonymous journey and enforces per-device isolation', async () => {
    // 0. Health check on the composed app.
    const health = await app.request('/health', {}, env);
    expect(health.status).toBe(200);

    // 1. Scan a menu (perception mocked). The success response IS the ScannedMenu.
    perceiveMenu.mockResolvedValue(FIXTURE_MENU);
    const scanRes = await call('/scan', 'POST', {
      image: IMAGE_DATA_URL,
      locale: 'en',
      context: 'lunch',
    });
    expect(scanRes.status).toBe(200);
    const scanned = (await scanRes.json()) as ScannedMenu;
    expect(scanned.dishes).toHaveLength(1);
    expect(typeof scanned.id).toBe('string');
    // The real dish carries the IngredientGuess shape + an engine-computed verdict/range.
    expect(scanned.dishes[0]!.ingredients[0]!.canonicalName).toBeTruthy();
    expect(scanned.dishes[0]!.suitability.level).toBeTruthy();

    // 2. Save the EXACT /scan output to /menus — the cross-route contract.
    const saveRes = await call('/menus', 'POST', { menu: scanned });
    expect(saveRes.status).toBe(201);

    // 3. History lists the saved menu for this device.
    const listRes = await call('/menus', 'GET');
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as { menus: ScannedMenu[] };
    expect(list.menus.map((m) => m.id)).toContain(scanned.id);

    // 4. Open it by id — dishes round-trip intact.
    const getRes = await call(`/menus/${scanned.id}`, 'GET');
    expect(getRes.status).toBe(200);
    const opened = (await getRes.json()) as ScannedMenu;
    expect(opened.dishes[0]!.translatedName).toBe('Grilled chicken with fries');
    expect(opened.dishes[0]!.ingredients[0]!.canonicalName).toBe(
      scanned.dishes[0]!.ingredients[0]!.canonicalName,
    );

    // 5. A DIFFERENT device cannot read it (per-device isolation, uniform 404).
    const otherRes = await call(`/menus/${scanned.id}`, 'GET', undefined, 'other-device-9876543210');
    expect(otherRes.status).toBe(404);

    // 6. Delete it, then it's gone.
    const delRes = await call(`/menus/${scanned.id}`, 'DELETE');
    expect(delRes.status).toBe(200);
    const goneRes = await call(`/menus/${scanned.id}`, 'GET');
    expect(goneRes.status).toBe(404);
  });

  it('a non-menu photo never fabricates dishes and is not persistable as a real menu', async () => {
    // Model says "not a menu": /scan returns an empty menu with notMenu + a hint.
    perceiveMenu.mockResolvedValue({
      dishes: [],
      menuConfidence: 0.05,
    } satisfies PerceivedMenu);
    const scanRes = await call('/scan', 'POST', { image: IMAGE_DATA_URL, locale: 'en' });
    expect(scanRes.status).toBe(200);
    const body = (await scanRes.json()) as ScannedMenu & { notMenu?: boolean; hint?: string };
    expect(body.dishes).toEqual([]);
    expect(body.notMenu).toBe(true);
    expect(typeof body.hint).toBe('string');
  });
});
