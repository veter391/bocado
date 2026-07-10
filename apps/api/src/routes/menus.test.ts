/**
 * Tests for /menus — anonymous save + recall of scanned menus.
 *
 * D1 is a FAKE in-memory store (src/test/fakeD1) — no real database, no network
 * (SECURITY.md). We assert the contract: save -> 201, list returns recent menus for
 * the device (newest first), get-by-id round-trips, missing id is 404, and the
 * anonymity guard rejects personal data at the boundary.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Dish, ScannedMenu } from '@bocado/shared';

import { menusRoute } from './menus';
import type { Env } from '../env';
import { envWithD1, makeFakeD1, type FakeD1 } from '../test/fakeD1';

const DEVICE_ID = 'device-abc-12345678';

/** A minimal but schema-valid Dish for persistence tests. */
const DISH: Dish = {
  id: 'pollo-0',
  originalText: 'Pollo a la plancha',
  translatedName: 'Grilled chicken',
  section: 'Mains',
  ingredients: [{ name: 'chicken', grams: 160 }],
  nutrition: {
    kcal: { min: 200, max: 280, unit: 'kcal' },
    protein: { min: 30, max: 38, unit: 'g' },
    fat: { min: 5, max: 9, unit: 'g' },
    salt: { min: 0.2, max: 0.5, unit: 'g' },
    confidence: 'medium',
    sources: [{ db: 'CIQUAL', recordId: '6101', name: 'chicken breast' }],
  },
  allergenFlags: [],
  suitability: {
    level: 'good',
    label: 'Good now',
    reasons: ['Lean protein'],
    confidence: 'medium',
    uncertain: false,
  },
};

function menu(overrides: Partial<ScannedMenu> = {}): ScannedMenu {
  return {
    id: 'menu-1',
    createdAt: '2026-06-17T10:00:00.000Z',
    context: 'lunch',
    title: 'La Taberna',
    dishes: [DISH],
    ...overrides,
  };
}

let fakeD1: FakeD1;
let env: Env;

beforeEach(() => {
  fakeD1 = makeFakeD1();
  env = envWithD1(fakeD1);
});

/** The single transport the client uses: the opaque device id as an `X-Device-Id` header. */
const DEVICE_ID_HEADER = 'X-Device-Id';

/** POST a body under a device header. `deviceId` defaults to the canonical test id. */
async function postMenu(body: unknown, deviceId: string | null = DEVICE_ID): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (deviceId !== null) headers[DEVICE_ID_HEADER] = deviceId;
  return menusRoute.request('/', { method: 'POST', headers, body: JSON.stringify(body) }, env);
}

/** A GET (list or by-id) under a device header. */
async function getAs(path: string, deviceId: string | null = DEVICE_ID): Promise<Response> {
  const headers: Record<string, string> = {};
  if (deviceId !== null) headers[DEVICE_ID_HEADER] = deviceId;
  return menusRoute.request(path, { headers }, env);
}

/** A DELETE (by-id or all) under a device header. */
async function deleteAs(path: string, deviceId: string | null = DEVICE_ID): Promise<Response> {
  const headers: Record<string, string> = {};
  if (deviceId !== null) headers[DEVICE_ID_HEADER] = deviceId;
  return menusRoute.request(path, { method: 'DELETE', headers }, env);
}

const OTHER_DEVICE = 'other-device-87654321';

describe('POST /menus — save', () => {
  it('saves a valid ScannedMenu under the device id and returns 201', async () => {
    const res = await postMenu({ menu: menu() });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe('menu-1');

    // Persisted under the device (from the header), with no PII columns.
    expect(fakeD1.savedMenus.size).toBe(1);
    const row = fakeD1.savedMenus.get('menu-1')!;
    expect(row.device_id).toBe(DEVICE_ID);
    expect(Object.keys(row)).toEqual(['id', 'device_id', 'created_at', 'context', 'title', 'dishes']);
  });

  it('rejects a body with an unknown (potentially personal) key', async () => {
    const res = await postMenu({ menu: menu(), allergies: ['milk'] });
    expect(res.status).toBe(400);
    expect(fakeD1.savedMenus.size).toBe(0);
  });

  it('rejects a missing device-id header', async () => {
    const res = await postMenu({ menu: menu() }, null);
    expect(res.status).toBe(400);
    expect(fakeD1.savedMenus.size).toBe(0);
  });

  it('rejects a short device-id header', async () => {
    const res = await postMenu({ menu: menu() }, 'short');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed menu (bad context enum)', async () => {
    const res = await postMenu({ menu: { ...menu(), context: 'brunch' } });
    expect(res.status).toBe(400);
  });
});

describe('GET /menus — list for a device', () => {
  it('returns saved menus for the device, newest first', async () => {
    await postMenu({ menu: menu({ id: 'm-old', createdAt: '2026-06-17T08:00:00.000Z' }) });
    await postMenu({ menu: menu({ id: 'm-new', createdAt: '2026-06-17T12:00:00.000Z' }) });

    const res = await getAs('/');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { menus: ScannedMenu[] };
    expect(body.menus.map((m) => m.id)).toEqual(['m-new', 'm-old']);
    // Round-trips the dishes JSON.
    expect(body.menus[0]!.dishes[0]!.translatedName).toBe('Grilled chicken');
  });

  it('does not return another device\'s menus', async () => {
    await postMenu({ menu: menu({ id: 'mine' }) }, DEVICE_ID);
    await postMenu({ menu: menu({ id: 'theirs' }) }, 'other-device-87654321');

    const res = await getAs('/', DEVICE_ID);
    const body = (await res.json()) as { menus: ScannedMenu[] };
    expect(body.menus.map((m) => m.id)).toEqual(['mine']);
  });

  it('rejects a missing device-id header with 400', async () => {
    const res = await getAs('/', null);
    expect(res.status).toBe(400);
  });
});

describe('GET /menus/:id', () => {
  it('round-trips a saved menu by id for its owner', async () => {
    await postMenu({ menu: menu() });
    const res = await getAs('/menu-1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as ScannedMenu;
    expect(body.id).toBe('menu-1');
    expect(body.title).toBe('La Taberna');
    expect(body.context).toBe('lunch');
    expect(body.dishes).toHaveLength(1);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await getAs('/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('does NOT return a menu owned by another device (no IDOR) — 404, not the menu', async () => {
    // Device A saves a menu; device B knows/guesses its id and asks for it.
    await postMenu({ menu: menu({ id: 'a-secret' }) }, DEVICE_ID);
    const res = await getAs('/a-secret', 'other-device-87654321');
    expect(res.status).toBe(404);
    // And nothing of the menu leaks in the body.
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.dishes).toBeUndefined();
    expect(body.title).toBeUndefined();
  });

  it('rejects a missing device-id header with 400', async () => {
    await postMenu({ menu: menu() });
    const res = await getAs('/menu-1', null);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /menus/:id — device-scoped erasure (GDPR Art. 17)', () => {
  it('owner deletes own menu: 200 {ok:true}, row gone, subsequent GET is 404', async () => {
    await postMenu({ menu: menu() });
    expect(fakeD1.savedMenus.size).toBe(1);

    const res = await deleteAs('/menu-1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(fakeD1.savedMenus.size).toBe(0);

    // The owner can no longer fetch it.
    const after = await getAs('/menu-1');
    expect(after.status).toBe(404);
  });

  it('a repeat delete of the same id is idempotent (still 200 {ok:true})', async () => {
    await postMenu({ menu: menu() });
    await deleteAs('/menu-1');
    const repeat = await deleteAs('/menu-1');
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual({ ok: true });
  });

  it('does NOT erase another device\'s menu (no IDOR) and returns the same shape', async () => {
    await postMenu({ menu: menu({ id: 'a-secret' }) }, DEVICE_ID);

    // Device B tries to delete A's menu.
    const res = await deleteAs('/a-secret', OTHER_DEVICE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // A's menu still exists and A can still read it.
    expect(fakeD1.savedMenus.has('a-secret')).toBe(true);
    const owner = await getAs('/a-secret', DEVICE_ID);
    expect(owner.status).toBe(200);
  });

  it('unknown / non-owned / owned-then-deleted all return an identical response (no existence oracle)', async () => {
    await postMenu({ menu: menu({ id: 'mine' }) }, DEVICE_ID);
    await postMenu({ menu: menu({ id: 'theirs' }) }, OTHER_DEVICE);

    const unknown = await deleteAs('/never-existed', DEVICE_ID);
    const nonOwned = await deleteAs('/theirs', DEVICE_ID);
    await deleteAs('/mine', DEVICE_ID);
    const ownedDeleted = await deleteAs('/mine', DEVICE_ID);

    for (const res of [unknown, nonOwned, ownedDeleted]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    // The non-owned delete left the other device's row intact.
    expect(fakeD1.savedMenus.has('theirs')).toBe(true);
  });

  it('rejects a missing / short device-id header with 400 and deletes nothing', async () => {
    await postMenu({ menu: menu() });
    expect((await deleteAs('/menu-1', null)).status).toBe(400);
    expect((await deleteAs('/menu-1', 'short')).status).toBe(400);
    expect(fakeD1.savedMenus.size).toBe(1);
  });
});

describe('DELETE /menus — clear all for a device (GDPR Art. 17)', () => {
  it('removes only the requesting device\'s menus and returns 200 {ok:true}', async () => {
    await postMenu({ menu: menu({ id: 'mine-1' }) }, DEVICE_ID);
    await postMenu({ menu: menu({ id: 'mine-2' }) }, DEVICE_ID);
    await postMenu({ menu: menu({ id: 'theirs' }) }, OTHER_DEVICE);

    const res = await deleteAs('/', DEVICE_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    // Only the other device's menu survives.
    expect([...fakeD1.savedMenus.keys()]).toEqual(['theirs']);
    const list = await getAs('/', DEVICE_ID);
    expect(((await list.json()) as { menus: ScannedMenu[] }).menus).toEqual([]);
  });

  it('is idempotent when the device has zero menus (200 {ok:true})', async () => {
    const res = await deleteAs('/', DEVICE_ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects a missing device-id header with 400', async () => {
    await postMenu({ menu: menu() });
    const res = await deleteAs('/', null);
    expect(res.status).toBe(400);
    expect(fakeD1.savedMenus.size).toBe(1);
  });
});
