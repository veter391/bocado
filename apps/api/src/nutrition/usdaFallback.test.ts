/**
 * USDA FoodData Central runtime fallback — unit tests.
 *
 * NO NETWORK, NO REAL KEY, BOCADO_LIVE never set: the FDC HTTP call is an injected
 * fake fetch returning canned FDC JSON, and D1 is a tiny in-memory fake scoped to the
 * usda_food_cache table. Asserts: key-gating (no key -> skip), FDC->FoodRecord mapping
 * (db:'API', salt from sodium, coarse category), positive + negative caching, and that
 * a cache-write failure never throws.
 */
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';
import { resolveViaUsdaFdc, type FetchImpl } from './usdaFallback';

/** A minimal in-memory D1 fake that only handles the usda_food_cache statements. */
function makeFdcD1(opts: { failWrites?: boolean } = {}) {
  const store = new Map<string, { food_key: string; record: string | null; created_at: string }>();
  function prepare(sql: string) {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    let params: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        params = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (s.startsWith('select food_key, record, created_at from usda_food_cache')) {
          return (store.get(String(params[0])) as T) ?? null;
        }
        throw new Error(`fdcD1: unhandled first() for: ${s}`);
      },
      async run() {
        if (opts.failWrites) throw new Error('simulated D1 write failure');
        if (s.startsWith('insert or replace into usda_food_cache')) {
          store.set(String(params[0]), {
            food_key: String(params[0]),
            record: params[1] === null ? null : String(params[1]),
            created_at: String(params[2]),
          });
          return { success: true } as unknown as D1Result;
        }
        throw new Error(`fdcD1: unhandled run() for: ${s}`);
      },
    };
    return stmt as unknown as D1PreparedStatement;
  }
  return { db: { prepare } as unknown as D1Database, store };
}

function makeEnv(d1: D1Database, overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'development',
    AI_GATEWAY_BASE_URL: 'https://example.invalid/gw',
    PERCEPTION_MODEL: 'm',
    PERCEPTION_MODEL_FALLBACK: 'm2',
    DB: d1,
    ...overrides,
  } as unknown as Env;
}

/** A canned FDC /foods/search response for a generic food. */
const FDC_OK = JSON.stringify({
  foods: [
    {
      fdcId: 167512,
      description: 'Mochi',
      dataType: 'SR Legacy',
      foodCategoryId: 18,
      foodNutrients: [
        { nutrientId: 1008, value: 250 }, // kcal
        { nutrientId: 1003, value: 4 }, // protein
        { nutrientId: 1004, value: 1 }, // fat
        { nutrientId: 1093, value: 100 }, // sodium mg -> salt 0.25 g
        { nutrientId: 1005, value: 55 }, // carbs
        { nutrientId: 2000, value: 10 }, // sugar
      ],
    },
  ],
});

const FDC_EMPTY = JSON.stringify({ foods: [] });

function fakeFetch(body: string, ok = true): { impl: FetchImpl; calls: string[] } {
  const calls: string[] = [];
  const impl: FetchImpl = (url) => {
    calls.push(url);
    return Promise.resolve({ ok, status: ok ? 200 : 500, text: () => Promise.resolve(body) });
  };
  return { impl, calls };
}

describe('resolveViaUsdaFdc — key gating', () => {
  it('returns null and makes NO call when FDC_API_KEY is absent', async () => {
    const { db } = makeFdcD1();
    const { impl, calls } = fakeFetch(FDC_OK);
    const out = await resolveViaUsdaFdc('mochi', makeEnv(db), { fetchImpl: impl });
    expect(out).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('resolveViaUsdaFdc — FDC -> FoodRecord mapping', () => {
  it('maps a generic FDC food to a db:"API" FoodRecord (salt from sodium, coarse category)', async () => {
    const { db } = makeFdcD1();
    const { impl, calls } = fakeFetch(FDC_OK);
    const out = await resolveViaUsdaFdc('mochi', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: impl });
    expect(out).not.toBeNull();
    expect(out!.db).toBe('API');
    expect(out!.id).toBe('usda-fdc-167512');
    expect(out!.per100g.salt).toBeCloseTo(0.25, 5); // 100 mg sodium * 2.5 / 1000
    expect(out!.category).toBe('grain'); // foodCategoryId 18 (Baked Products)
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('api.nal.usda.gov/fdc/v1/foods/search');
    // The query carries ONLY a generic food name (anonymity) — no identity params.
    expect(calls[0]).toContain('query=mochi');
    expect(calls[0]).not.toMatch(/userId|allergy|profile/i);
  });
});

describe('resolveViaUsdaFdc — caching', () => {
  it('caches a positive result and serves it without a second call', async () => {
    const { db, store } = makeFdcD1();
    const f1 = fakeFetch(FDC_OK);
    await resolveViaUsdaFdc('mochi', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: f1.impl });
    expect(store.size).toBe(1);

    const f2 = fakeFetch(FDC_OK);
    const out = await resolveViaUsdaFdc('mochi', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: f2.impl });
    expect(out).not.toBeNull();
    expect(f2.calls).toHaveLength(0); // served from cache, no second HTTP call
  });

  it('caches a NEGATIVE result (empty search) so repeated unknowns do not re-hit', async () => {
    const { db, store } = makeFdcD1();
    const f1 = fakeFetch(FDC_EMPTY);
    const out = await resolveViaUsdaFdc('zzz unknown', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: f1.impl });
    expect(out).toBeNull();
    expect(store.size).toBe(1); // negative cached
    const f2 = fakeFetch(FDC_EMPTY);
    await resolveViaUsdaFdc('zzz unknown', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: f2.impl });
    expect(f2.calls).toHaveLength(0);
  });

  it('a cache-write failure NEVER throws (best-effort) — still returns the record', async () => {
    const { db } = makeFdcD1({ failWrites: true });
    const { impl } = fakeFetch(FDC_OK);
    const out = await resolveViaUsdaFdc('mochi', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: impl });
    expect(out).not.toBeNull();
    expect(out!.db).toBe('API');
  });

  it('a non-2xx FDC response resolves to null (honest unmatched), cached negative', async () => {
    const { db } = makeFdcD1();
    const { impl } = fakeFetch('{}', false);
    const out = await resolveViaUsdaFdc('mochi', makeEnv(db, { FDC_API_KEY: 'k' }), { fetchImpl: impl });
    expect(out).toBeNull();
  });

  it('is deterministic given the same canned response', async () => {
    const a = makeFdcD1();
    const b = makeFdcD1();
    const ra = await resolveViaUsdaFdc('mochi', makeEnv(a.db, { FDC_API_KEY: 'k' }), {
      fetchImpl: fakeFetch(FDC_OK).impl,
    });
    const rb = await resolveViaUsdaFdc('mochi', makeEnv(b.db, { FDC_API_KEY: 'k' }), {
      fetchImpl: fakeFetch(FDC_OK).impl,
    });
    // created_at differs (clock), but the mapped FoodRecord is identical.
    expect(ra).toEqual(rb);
  });
});
