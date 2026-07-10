/**
 * Tests for the fixed-window rate limiter (a cost floor, not abuse prevention).
 *
 * The pure helpers (windowStart, parseLimit, checkRateLimit) are tested directly; the
 * stateful enforceRateLimit is exercised against the in-memory fakeD1 store and a
 * throwing fake DB to prove it FAILS OPEN (SECURITY.md). No network, no real keys.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  checkRateLimit,
  enforceRateLimit,
  hashKey,
  parseLimit,
  WINDOW_MS,
  windowStart,
} from './rateLimit';
import type { Env } from './env';
import { envWithD1, makeFakeD1 } from './test/fakeD1';

describe('windowStart', () => {
  it('floors an instant to the top of its hour window', () => {
    const base = windowStart(Date.now());
    expect(base % WINDOW_MS).toBe(0);
  });

  it('maps two instants in the same hour to the same window, next hour to a new one', () => {
    const start = 1_000 * WINDOW_MS; // an exact window boundary
    expect(windowStart(start)).toBe(start);
    expect(windowStart(start + 5)).toBe(start);
    expect(windowStart(start + WINDOW_MS - 1)).toBe(start);
    expect(windowStart(start + WINDOW_MS)).toBe(start + WINDOW_MS);
  });
});

describe('parseLimit', () => {
  it('returns a finite positive integer unchanged', () => {
    expect(parseLimit('5')).toBe(5);
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('1000')).toBe(1000);
  });

  it('returns null (disabled) for undefined / NaN / zero / negative / float', () => {
    expect(parseLimit(undefined)).toBeNull();
    expect(parseLimit('')).toBeNull();
    expect(parseLimit('abc')).toBeNull();
    expect(parseLimit('0')).toBeNull();
    expect(parseLimit('-3')).toBeNull();
    expect(parseLimit('2.5')).toBeNull();
  });
});

describe('checkRateLimit', () => {
  const now = 5 * WINDOW_MS + 12_345; // somewhere inside a window

  it('allows requests strictly below the cap', () => {
    expect(checkRateLimit(0, 3, now).allowed).toBe(true);
    expect(checkRateLimit(2, 3, now).allowed).toBe(true);
  });

  it('denies once the prior count reaches the cap, with a positive retryAfter', () => {
    const decision = checkRateLimit(3, 3, now);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBeGreaterThan(0);
    // retryAfter points at the next window boundary.
    const expected = Math.ceil((windowStart(now) + WINDOW_MS - now) / 1000);
    expect(decision.retryAfter).toBe(expected);
  });
});

describe('enforceRateLimit (stateful, fakeD1)', () => {
  const now = 7 * WINDOW_MS + 999;

  it('allows up to the cap then 429s, and resets in the next window', async () => {
    const fake = makeFakeD1();
    const env = envWithD1(fake);

    // cap = 2: first two requests allowed, third denied.
    expect((await enforceRateLimit(env, 'k', 2, now)).allowed).toBe(true);
    expect((await enforceRateLimit(env, 'k', 2, now)).allowed).toBe(true);
    const denied = await enforceRateLimit(env, 'k', 2, now);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);

    // A request in the NEXT window starts a fresh count -> allowed again.
    expect((await enforceRateLimit(env, 'k', 2, now + WINDOW_MS)).allowed).toBe(true);
  });

  it('is disabled (allows) when the limit is null', async () => {
    const fake = makeFakeD1();
    const env = envWithD1(fake);
    for (let i = 0; i < 10; i += 1) {
      expect((await enforceRateLimit(env, 'k', null, now)).allowed).toBe(true);
    }
    // Nothing was persisted when disabled.
    expect(fake.rateLimits.size).toBe(0);
  });

  it('FAILS OPEN and does not log when the counter store throws', async () => {
    const throwingDb = {
      prepare() {
        throw new Error('D1 unavailable');
      },
    } as unknown as D1Database;
    const env = { DB: throwingDb } as unknown as Env;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const decision = await enforceRateLimit(env, 'k', 1, now);
    expect(decision.allowed).toBe(true);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('isolates counts across distinct keys', async () => {
    const fake = makeFakeD1();
    const env = envWithD1(fake);
    // cap = 1 each: a's second is denied, b's first is still allowed.
    expect((await enforceRateLimit(env, 'a', 1, now)).allowed).toBe(true);
    expect((await enforceRateLimit(env, 'a', 1, now)).allowed).toBe(false);
    expect((await enforceRateLimit(env, 'b', 1, now)).allowed).toBe(true);
  });
});

describe('hashKey', () => {
  it('is deterministic and one-way (does not contain the raw input)', async () => {
    const a = await hashKey('203.0.113.7');
    const b = await hashKey('203.0.113.7');
    expect(a).toBe(b);
    expect(a).not.toContain('203.0.113.7');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // Different IPs hash differently.
    expect(await hashKey('203.0.113.8')).not.toBe(a);
  });
});
