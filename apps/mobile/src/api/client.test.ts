/**
 * Unit tests for the mobile API client. NO NETWORK: `fetch` is mocked at the global
 * boundary. Because `API_BASE_URL` is resolved from `process.env` at module load, we
 * set the env var and use `vi.resetModules()` + dynamic `import()` to load the client
 * fresh in each mode (configured vs. mock).
 *
 * These tests import ONLY the client + shared types — never a React Native
 * component/screen — so they run in the Node vitest environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScannedMenu } from '@bocado/shared';

const BASE = 'https://api.test.example';

/** A minimal well-formed ScannedMenu the client's shape guard accepts. */
const MENU: ScannedMenu = {
  id: 'menu-1',
  createdAt: '2026-06-16T20:00:00.000Z',
  context: 'dinner',
  title: 'Test Trattoria',
  dishes: [
    {
      id: 'dish-1',
      originalText: 'Pollo',
      translatedName: 'Chicken',
      ingredients: [{ name: 'chicken breast', grams: 180 }],
      allergenFlags: [],
      suitability: { level: 'good', label: 'Good now', reasons: [], confidence: 'medium', uncertain: false },
    },
  ],
};

/** Load the client module fresh with `API_BASE_URL` set to `base` (or mock mode if null). */
async function loadClient(base: string | null) {
  vi.resetModules();
  if (base === null) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = base;
  }
  return import('./client');
}

/** Build a fake `fetch` returning one scripted Response, recording the single call. */
function mockFetch(response: Partial<Response> & { ok: boolean; status: number }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response as Response);
  });
  vi.stubGlobal('fetch', impl);
  return { calls, impl };
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as Partial<Response> & { ok: boolean; status: number };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
});

describe('scanMenu — configured backend', () => {
  it('POSTs to /scan with only { image, locale?, context? } and returns the menu', async () => {
    const { calls } = mockFetch(jsonResponse(MENU));
    const { scanMenu } = await loadClient(BASE);

    const result = await scanMenu('data:image/jpeg;base64,AAAA', {
      locale: 'es',
      context: 'dinner',
    });

    // scanMenu now returns a ScanResult envelope: the menu + the non-menu signal.
    expect(result.menu).toEqual(MENU);
    expect(result.notMenu).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/scan`);
    expect(calls[0]?.init.method).toBe('POST');

    // PRIVACY: the body carries ONLY the allowed keys — no profile/allergies/userId.
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(Object.keys(body).sort()).toEqual(['context', 'image', 'locale'].sort());
    expect(body.image).toBe('data:image/jpeg;base64,AAAA');
    const serialized = String(calls[0]?.init.body).toLowerCase();
    for (const forbidden of ['profile', 'allergy', 'allergies', 'userid', 'goals', 'consent']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('omits locale/context from the body when not provided', async () => {
    const { calls } = mockFetch(jsonResponse(MENU));
    const { scanMenu } = await loadClient(BASE);

    await scanMenu('data:image/png;base64,BBBB');

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(Object.keys(body)).toEqual(['image']);
  });

  it('sends several pages as images[] (multi-page) in ONE call, never as image', async () => {
    const { calls } = mockFetch(jsonResponse(MENU));
    const { scanMenu } = await loadClient(BASE);

    const pages = ['data:image/jpeg;base64,P1', 'data:image/jpeg;base64,P2'];
    await scanMenu(pages, { locale: 'en' });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body.images).toEqual(pages);
    expect(body.image).toBeUndefined();
    // Still anonymous: only the allowed keys.
    expect(Object.keys(body).sort()).toEqual(['images', 'locale'].sort());
  });

  it('surfaces the edge notMenu flag + hint without fabricating dishes', async () => {
    mockFetch(jsonResponse({ ...MENU, dishes: [], notMenu: true, hint: 'Not a menu.' }));
    const { scanMenu } = await loadClient(BASE);

    const result = await scanMenu('data:image/png;base64,ZZZZ');
    expect(result.notMenu).toBe(true);
    expect(result.hint).toBe('Not a menu.');
    expect(result.menu.dishes).toEqual([]);
  });

  it('throws ApiError with the status on a non-ok response', async () => {
    mockFetch(jsonResponse({ error: 'bad' }, { ok: false, status: 502 }));
    const { scanMenu, ApiError } = await loadClient(BASE);

    await expect(scanMenu('data:image/png;base64,CCCC')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
    });
    // Cross-check the error type explicitly.
    await expect(scanMenu('data:image/png;base64,CCCC')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError when the response body is not a valid menu shape', async () => {
    mockFetch(jsonResponse({ nope: true }));
    const { scanMenu } = await loadClient(BASE);

    await expect(scanMenu('data:image/png;base64,DDDD')).rejects.toMatchObject({
      name: 'ApiError',
    });
  });

  it('aborts and throws ApiError on timeout (AbortError)', async () => {
    // fetch rejects as if aborted; the client maps it to a friendly timeout error.
    const abortErr = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const impl = vi.fn(() => Promise.reject(abortErr));
    vi.stubGlobal('fetch', impl);
    const { scanMenu } = await loadClient(BASE);

    await expect(scanMenu('data:image/png;base64,EEEE')).rejects.toMatchObject({
      name: 'ApiError',
    });
  });
});

describe('scanMenu — mock mode (no backend)', () => {
  it('throws ApiError without ever calling fetch', async () => {
    const impl = vi.fn();
    vi.stubGlobal('fetch', impl);
    const { scanMenu } = await loadClient(null);

    await expect(scanMenu('data:image/png;base64,FFFF')).rejects.toMatchObject({
      name: 'ApiError',
    });
    expect(impl).not.toHaveBeenCalled();
  });
});

describe('dishImageUrl', () => {
  it('builds an encoded /image URL when configured', async () => {
    const { dishImageUrl } = await loadClient(BASE);
    expect(dishImageUrl('Mushroom risotto')).toBe(`${BASE}/image?name=Mushroom%20risotto`);
    expect(dishImageUrl('Pâté & frites')).toBe(
      `${BASE}/image?name=${encodeURIComponent('Pâté & frites')}`,
    );
  });

  it('throws ApiError in mock mode', async () => {
    const { dishImageUrl } = await loadClient(null);
    expect(() => dishImageUrl('anything')).toThrow();
  });
});

const DEVICE = 'device-abcdef123456';

/** A 204 No Content response (no body). `.json()` would throw if ever called. */
function emptyResponse(status = 204) {
  return {
    ok: true,
    status,
    headers: { get: () => null },
    json: () => Promise.reject(new Error('204 has no body — json() must not be called')),
  } as unknown as Partial<Response> & { ok: boolean; status: number };
}

describe('deleteMenu / deleteAllMenus — configured backend', () => {
  it('deleteMenu issues a DELETE to /menus/:id with the X-Device-Id header and no body', async () => {
    const { calls } = mockFetch(emptyResponse());
    const { deleteMenu } = await loadClient(BASE);

    await expect(deleteMenu('m-1', DEVICE)).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${BASE}/menus/m-1`);
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.body).toBeUndefined();
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-Device-Id']).toBe(DEVICE);
  });

  it('deleteMenu encodes the id into the path', async () => {
    const { calls } = mockFetch(emptyResponse());
    const { deleteMenu } = await loadClient(BASE);

    await deleteMenu('m 1/2', DEVICE);
    expect(calls[0]?.url).toBe(`${BASE}/menus/${encodeURIComponent('m 1/2')}`);
  });

  it('deleteAllMenus issues a DELETE to /menus with the header and no body', async () => {
    const { calls } = mockFetch(emptyResponse());
    const { deleteAllMenus } = await loadClient(BASE);

    await expect(deleteAllMenus(DEVICE)).resolves.toBeUndefined();

    expect(calls[0]?.url).toBe(`${BASE}/menus`);
    expect(calls[0]?.init.method).toBe('DELETE');
    expect(calls[0]?.init.body).toBeUndefined();
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['X-Device-Id']).toBe(DEVICE);
  });

  it('resolves an empty 200 (Content-Length: 0) the same as a 204', async () => {
    const res = {
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? '0' : null) },
      json: () => Promise.reject(new Error('empty body — json() must not be called')),
    } as unknown as Partial<Response> & { ok: boolean; status: number };
    mockFetch(res);
    const { deleteMenu } = await loadClient(BASE);

    await expect(deleteMenu('m-9', DEVICE)).resolves.toBeUndefined();
  });

  it('rejects with ApiError carrying the status on a non-ok response', async () => {
    mockFetch(jsonResponse({ error: 'nope' }, { ok: false, status: 400 }));
    const { deleteMenu, ApiError } = await loadClient(BASE);

    await expect(deleteMenu('m-1', DEVICE)).rejects.toMatchObject({ name: 'ApiError', status: 400 });
    await expect(deleteMenu('m-1', DEVICE)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('deleteMenu / deleteAllMenus — mock mode (no backend)', () => {
  it('both throw ApiError without ever calling fetch', async () => {
    const impl = vi.fn();
    vi.stubGlobal('fetch', impl);
    const { deleteMenu, deleteAllMenus } = await loadClient(null);

    await expect(deleteMenu('m-1', DEVICE)).rejects.toMatchObject({ name: 'ApiError' });
    await expect(deleteAllMenus(DEVICE)).rejects.toMatchObject({ name: 'ApiError' });
    expect(impl).not.toHaveBeenCalled();
  });
});
