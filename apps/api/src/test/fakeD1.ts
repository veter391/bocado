/**
 * A tiny in-memory fake of the D1 client surface this Worker uses, for unit tests.
 *
 * It is NOT a SQL engine: it pattern-matches the handful of statements the routes
 * actually issue (perception_cache get/put, saved_menus insert/list/get) and stores
 * rows in plain Maps. This keeps tests free of any real D1/network (SECURITY.md:
 * "No real API keys/network in tests") while still exercising the route logic.
 *
 * Each `prepare(sql)` returns a statement whose `bind(...)` captures the params and
 * whose `first` / `run` / `all` interpret them against the in-memory store.
 */
import { vi } from 'vitest';

import type { Env } from '../env';

interface PerceptionRow {
  image_hash: string;
  perceived: string;
  created_at: string;
}

interface SavedMenuRow {
  id: string;
  device_id: string;
  created_at: string;
  context: string;
  title: string | null;
  dishes: string;
}

interface UsdaFoodRow {
  food_key: string;
  record: string | null;
  created_at: string;
}

interface RateLimitRow {
  key: string;
  window_start: number;
  count: number;
}

export interface FakeD1 {
  db: D1Database;
  perception: Map<string, PerceptionRow>;
  savedMenus: Map<string, SavedMenuRow>;
  /** USDA-FDC runtime fallback cache (only touched when FDC_API_KEY is set). */
  usdaFoods: Map<string, UsdaFoodRow>;
  /** Fixed-window rate-limit counters, keyed by the opaque limiter key. */
  rateLimits: Map<string, RateLimitRow>;
  /** Spy that records every prepared SQL string (for asserting cache hit/miss paths). */
  prepareSpy: ReturnType<typeof vi.fn>;
}

/** Normalize whitespace so matching on SQL fragments is robust to formatting. */
function squash(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function makeFakeD1(): FakeD1 {
  const perception = new Map<string, PerceptionRow>();
  const savedMenus = new Map<string, SavedMenuRow>();
  const usdaFoods = new Map<string, UsdaFoodRow>();
  const rateLimits = new Map<string, RateLimitRow>();
  const prepareSpy = vi.fn();

  function prepare(sql: string): D1PreparedStatement {
    prepareSpy(sql);
    const s = squash(sql);
    let params: unknown[] = [];

    const stmt = {
      bind(...args: unknown[]) {
        params = args;
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        if (s.startsWith('select perceived from perception_cache')) {
          const row = perception.get(String(params[0]));
          return row ? ({ perceived: row.perceived } as T) : null;
        }
        if (s.startsWith('select id, created_at, context, title, dishes from saved_menus where id =')) {
          const row = savedMenus.get(String(params[0]));
          // The route scopes by device too (`... AND device_id = ?`) to prevent IDOR;
          // honour that here so a non-owning device sees the row as absent (null).
          if (row && s.includes('device_id') && row.device_id !== String(params[1])) {
            return null;
          }
          return row ? (row as unknown as T) : null;
        }
        // Ownership probe used by POST /menus before an upsert: look up a row's owner
        // by id ALONE (not device-scoped) so a cross-device id collision can be rejected.
        if (s.startsWith('select device_id from saved_menus where id =')) {
          const row = savedMenus.get(String(params[0]));
          return row ? ({ device_id: row.device_id } as T) : null;
        }
        if (s.startsWith('select food_key, record, created_at from usda_food_cache')) {
          return (usdaFoods.get(String(params[0])) as T) ?? null;
        }
        if (s.startsWith('select count, window_start from rate_limit_counters where key =')) {
          const row = rateLimits.get(String(params[0]));
          return row ? (row as unknown as T) : null;
        }
        // Atomic increment-and-read (INSERT ... ON CONFLICT DO UPDATE ... RETURNING) used
        // by enforceRateLimit: increment within the same window, reset to 1 on rollover,
        // and return the NEW count — mirroring the single-statement D1 upsert.
        if (s.startsWith('insert into rate_limit_counters')) {
          const k = String(params[0]);
          const start = Number(params[1]);
          const existing = rateLimits.get(k);
          const count = existing && existing.window_start === start ? existing.count + 1 : 1;
          rateLimits.set(k, { key: k, window_start: start, count });
          return { count } as unknown as T;
        }
        throw new Error(`fakeD1: unhandled first() for: ${s}`);
      },
      async run() {
        if (s.startsWith('insert or replace into perception_cache')) {
          perception.set(String(params[0]), {
            image_hash: String(params[0]),
            perceived: String(params[1]),
            created_at: String(params[2]),
          });
          return { success: true } as unknown as D1Result;
        }
        if (s.startsWith('insert or replace into saved_menus')) {
          savedMenus.set(String(params[0]), {
            id: String(params[0]),
            device_id: String(params[1]),
            created_at: String(params[2]),
            context: String(params[3]),
            title: params[4] === null ? null : String(params[4]),
            dishes: String(params[5]),
          });
          return { success: true } as unknown as D1Result;
        }
        if (s.startsWith('insert or replace into usda_food_cache')) {
          usdaFoods.set(String(params[0]), {
            food_key: String(params[0]),
            record: params[1] === null ? null : String(params[1]),
            created_at: String(params[2]),
          });
          return { success: true } as unknown as D1Result;
        }
        if (s.startsWith('insert or replace into rate_limit_counters')) {
          rateLimits.set(String(params[0]), {
            key: String(params[0]),
            window_start: Number(params[1]),
            count: Number(params[2]),
          });
          return { success: true } as unknown as D1Result;
        }
        // Device-scoped single-menu delete. Mirrors the SELECT-by-id IDOR guard: the
        // row is removed ONLY when its device_id matches the second bound param, so a
        // non-owning device's DELETE removes nothing (and the row survives).
        if (s.startsWith('delete from saved_menus where id = ? and device_id =')) {
          const row = savedMenus.get(String(params[0]));
          if (row && row.device_id === String(params[1])) {
            savedMenus.delete(String(params[0]));
          }
          return { success: true } as unknown as D1Result;
        }
        // Delete-all for a device: drop every row whose device_id matches, leaving
        // other devices' menus untouched.
        if (s.startsWith('delete from saved_menus where device_id =')) {
          const deviceId = String(params[0]);
          for (const [id, row] of savedMenus) {
            if (row.device_id === deviceId) savedMenus.delete(id);
          }
          return { success: true } as unknown as D1Result;
        }
        throw new Error(`fakeD1: unhandled run() for: ${s}`);
      },
      async all<T>(): Promise<D1Result<T>> {
        if (s.startsWith('select id, created_at, context, title, dishes from saved_menus where device_id =')) {
          const deviceId = String(params[0]);
          const rows = [...savedMenus.values()]
            .filter((r) => r.device_id === deviceId)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return { results: rows as unknown as T[], success: true } as unknown as D1Result<T>;
        }
        throw new Error(`fakeD1: unhandled all() for: ${s}`);
      },
    };
    return stmt as unknown as D1PreparedStatement;
  }

  const db = { prepare } as unknown as D1Database;
  return { db, perception, savedMenus, usdaFoods, rateLimits, prepareSpy };
}

/** Build a test Env carrying a fake D1 (and the perception-model config stubs). */
export function envWithD1(fake: FakeD1, overrides: Partial<Env> = {}): Env {
  return {
    OPENROUTER_API_KEY: 'test-key-not-used',
    ENVIRONMENT: 'development',
    AI_GATEWAY_BASE_URL: 'https://example.invalid/gateway',
    PERCEPTION_MODEL: 'minimax/minimax-m3',
    PERCEPTION_MODEL_FALLBACK: 'minimax/minimax-01',
    DB: fake.db,
    ...overrides,
  } as unknown as Env;
}
