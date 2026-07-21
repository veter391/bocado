/**
 * Tests for the lazy dish-image route. These assert the CONTRACT, not pixels:
 *   - cache HIT serves the stored bytes and NEVER calls the model;
 *   - cache MISS calls the model EXACTLY once, persists to R2 with `aiGenerated`
 *     provenance, and the response carries the AI Act Art. 50 marker;
 *   - bad input (missing / empty / over-long / punctuation-only) is a 400;
 *   - the R2 key is keyspace-safe (no traversal) and prompt-versioned.
 *
 * No network, no real keys: a FAKE Env (mock IMAGES.get/put + mock AI.run) stands in
 * for the Workers bindings, per SECURITY.md ("No real API keys/network in tests").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../env';
import { foodImagePrompt, imageRoute } from './image';

/** A 1x1 PNG, as the base64 string Workers AI returns under `image`. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const PNG_BYTES = base64ToBytes(PNG_BASE64);

interface PutCall {
  key: string;
  value: Uint8Array;
  options: R2PutOptions;
}

/**
 * Build a fake Env. `stored` seeds the R2 "bucket"; the returned spies let tests
 * assert call counts and the exact metadata written.
 */
function makeEnv(stored: Record<string, Uint8Array> = {}) {
  const bucket = new Map<string, Uint8Array>(Object.entries(stored));
  const putCalls: PutCall[] = [];

  const get = vi.fn(async (key: string) => {
    const value = bucket.get(key);
    if (value === undefined) return null;
    return {
      // R2ObjectBody.body is a ReadableStream; Hono streams it straight through.
      body: new Response(value).body,
      httpEtag: `"etag-${key}"`,
      arrayBuffer: async () => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    };
  });

  const put = vi.fn(async (key: string, value: ArrayBuffer | Uint8Array, options: R2PutOptions) => {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    bucket.set(key, bytes);
    putCalls.push({ key, value: bytes, options });
    return { key };
  });

  const run = vi.fn(async () => ({ image: PNG_BASE64 }));

  const env = {
    IMAGES: { get, put } as unknown as R2Bucket,
    AI: { run } as unknown as Ai,
  } as unknown as Env;

  return { env, get, put, run, putCalls, bucket };
}

/** Drive the route the way Hono's router does, with our fake bindings. */
async function call(env: Env, url: string): Promise<Response> {
  return imageRoute.request(url, {}, env);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /image — cache HIT', () => {
  it('serves the stored bytes and does NOT call the model', async () => {
    const key = 'dishes/v1/mushroom risotto.png';
    const { env, run, put } = makeEnv({ [key]: PNG_BYTES });

    const res = await call(env, '/?name=Mushroom%20Risotto');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-AI-Generated')).toBe('true');
    expect(res.headers.get('Cache-Control')).toContain('immutable');

    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG_BYTES));

    // The whole point of the cache: no generation, no write.
    expect(run).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

describe('GET /image — cache MISS', () => {
  it('calls the model exactly once, stores to R2 with aiGenerated metadata, marks the response', async () => {
    const { env, run, put, putCalls } = makeEnv();

    const res = await call(env, '/?name=Mushroom%20Risotto');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('image/png');
    expect(res.headers.get('X-AI-Generated')).toBe('true');

    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual(Array.from(PNG_BYTES));

    // Generated exactly once.
    expect(run).toHaveBeenCalledTimes(1);
    // The prompt is fed the NORMALIZED name (lowercase, [a-z0-9 ] only) — injection
    // hardening: no punctuation/newlines from the raw query reach the image model.
    expect(run).toHaveBeenCalledWith(
      '@cf/black-forest-labs/flux-1-schnell',
      expect.objectContaining({ prompt: expect.stringContaining('mushroom risotto') }),
    );

    // Persisted exactly once, keyspace-safe + prompt-versioned key.
    expect(put).toHaveBeenCalledTimes(1);
    expect(putCalls).toHaveLength(1);
    const writtenKey = putCalls[0]!.key;
    expect(writtenKey).toBe('dishes/v1/mushroom risotto.png');

    // Provenance metadata = the AI Act Art. 50 machine-readable mark on the object.
    const meta = putCalls[0]!.options.customMetadata;
    expect(meta).toMatchObject({
      aiGenerated: 'true',
      model: 'flux-1-schnell',
      name: 'Mushroom Risotto',
    });
    expect(putCalls[0]!.options.httpMetadata).toMatchObject({ contentType: 'image/png' });
  });

  it('a second request for the same dish is served from cache (model called once total)', async () => {
    const { env, run, put } = makeEnv();

    await call(env, '/?name=Carbonara');
    const second = await call(env, '/?name=Carbonara');

    expect(second.status).toBe(200);
    expect(second.headers.get('X-AI-Generated')).toBe('true');
    expect(run).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('normalizes the name so accents/casing collapse to the same cache key', async () => {
    const { env, run } = makeEnv();

    await call(env, '/?name=Sol%C3%A9'); // "Solé"
    await call(env, '/?name=sole');

    // "Solé" and "sole" normalize identically -> one generation, one cached object.
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('GET /image — invalid input -> 400', () => {
  it('rejects a missing name', async () => {
    const { env, run } = makeEnv();
    const res = await call(env, '/');
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects an empty / whitespace-only name', async () => {
    const { env, run } = makeEnv();
    const res = await call(env, '/?name=%20%20');
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects a punctuation-only name (normalizes to empty)', async () => {
    const { env, run, put } = makeEnv();
    const res = await call(env, '/?name=---');
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('rejects an over-long name (length cap)', async () => {
    const { env, run } = makeEnv();
    const res = await call(env, `/?name=${'a'.repeat(200)}`);
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
});

describe('R2 key safety + anonymity', () => {
  it('cannot escape the keyspace with traversal characters in the name', async () => {
    const { env, putCalls } = makeEnv();

    // Slashes/dots are stripped by normalizeName; the key stays under dishes/v1/.
    await call(env, '/?name=' + encodeURIComponent('../../secret/passwd'));

    const writtenKey = putCalls[0]!.key;
    expect(writtenKey.startsWith('dishes/v1/')).toBe(true);
    expect(writtenKey).not.toContain('..');
    // Exactly two slashes — the two literal segment separators we control.
    expect(writtenKey.split('/').length).toBe(3);
  });
});

describe('GET /image — rate limit (cost floor, keyed on hashed CF-Connecting-IP)', () => {
  const IP = '203.0.113.7';

  /** Call the route with a client IP header so the keyless image plane has a key. */
  async function callIp(env: Env, url: string, ip: string): Promise<Response> {
    return imageRoute.request(url, { headers: { 'CF-Connecting-IP': ip } }, env);
  }

  function makeRateEnv(limit: string) {
    const fakeDb = makeFakeRateDb();
    const base = makeEnv();
    const env = { ...base.env, DB: fakeDb, IMAGE_RATE_LIMIT: limit } as unknown as Env;
    return { env, run: base.run };
  }

  /** A tiny in-memory D1 stand-in supporting only the limiter's two statements. */
  function makeFakeRateDb(): D1Database {
    const rows = new Map<string, { count: number; window_start: number }>();
    return {
      prepare(sql: string) {
        const s = sql.toLowerCase();
        let params: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) {
            params = args;
            return stmt;
          },
          async first() {
            // Atomic increment-and-read (INSERT ... ON CONFLICT ... RETURNING count).
            if (s.includes('into rate_limit_counters')) {
              const k = String(params[0]);
              const start = Number(params[1]);
              const existing = rows.get(k);
              const count = existing && existing.window_start === start ? existing.count + 1 : 1;
              rows.set(k, { window_start: start, count });
              return { count };
            }
            if (s.includes('from rate_limit_counters')) {
              return rows.get(String(params[0])) ?? null;
            }
            return null;
          },
          async run() {
            return { success: true };
          },
        };
        return stmt as unknown as D1PreparedStatement;
      },
    } as unknown as D1Database;
  }

  it('serves a normal request and 429s the over-cap one without calling the model', async () => {
    const { env, run } = makeRateEnv('1');

    const first = await callIp(env, '/?name=Carbonara', IP);
    expect(first.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);

    const second = await callIp(env, '/?name=Risotto', IP);
    expect(second.status).toBe(429);
    expect(Number(second.headers.get('Retry-After'))).toBeGreaterThan(0);
    // The blocked request never generated a new image.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('isolates the counter per client IP', async () => {
    const { env } = makeRateEnv('1');
    expect((await callIp(env, '/?name=A', IP)).status).toBe(200);
    expect((await callIp(env, '/?name=B', IP)).status).toBe(429);
    expect((await callIp(env, '/?name=C', '198.51.100.9')).status).toBe(200);
  });

  it('does NOT count an invalid (400) name against the limit', async () => {
    const { env } = makeRateEnv('1');
    // A bad name 400s before the limiter, so the real request still has its allowance.
    expect((await callIp(env, '/?name=', IP)).status).toBe(400);
    expect((await callIp(env, '/?name=Paella', IP)).status).toBe(200);
  });

  it('FAILS OPEN: a throwing counter store still serves the image', async () => {
    const base = makeEnv();
    const throwingDb = {
      prepare() {
        throw new Error('D1 unavailable');
      },
    } as unknown as D1Database;
    const env = { ...base.env, DB: throwingDb, IMAGE_RATE_LIMIT: '1' } as unknown as Env;

    expect((await callIp(env, '/?name=A', IP)).status).toBe(200);
    expect((await callIp(env, '/?name=B', IP)).status).toBe(200);
  });
});

describe('foodImagePrompt', () => {
  it('includes the dish name and frames the output as an illustration, not a photo', () => {
    const prompt = foodImagePrompt('Paella Valenciana');
    expect(prompt).toContain('Paella Valenciana');
    expect(prompt.toLowerCase()).toContain('illustration');
    expect(prompt.toLowerCase()).toContain('not a real photograph');
    // Anonymity: a static prompt — no user data templated in.
    expect(prompt.toLowerCase()).not.toContain('allerg');
  });
});
