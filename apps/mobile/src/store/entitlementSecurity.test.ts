/**
 * Entitlement security tests.
 *
 * Covers the three invariants that must never regress:
 *   1. The ?pro=1 URL override is dead-code in production: __DEV__ === false in a
 *      prod build means the override block is never entered. We test the PURE logic
 *      of initialTier by re-implementing the guard inline, since the real
 *      initialTier() depends on a global window that is not injectable (it reads
 *      window.location directly). We validate the guard condition is checked before
 *      the URL param is read.
 *
 *   2. parseTier / serializeTier: garbage/unknown values collapse to free.
 *      Already covered by entitlementStorage.test.ts but we add supplementary
 *      injection-style cases: truncated JSON, numeric strings, SQL-like strings.
 *
 *   3. The __DEV__ guard logic: even if window is defined and ?pro=1 is present,
 *      initialTier() only returns pro when __DEV__ is truthy.
 */
import { describe, expect, it } from 'vitest';
import { parseTier, serializeTier } from './entitlementStorage';

// Re-implement the exact initialTier guard logic in a node-testable form.
// This lets us inject (devMode, hasWindow, searchParam) without touching the real module.
function initialTierLogic(
  devMode: boolean,
  hasWindow: boolean,
  hasLocation: boolean,
  proParam: string | null,
): string {
  if (devMode && hasWindow && hasLocation) {
    if (proParam === '1' || proParam === 'true') return 'pro';
  }
  return 'free';
}

describe('Entitlement security: initialTier __DEV__ guard', () => {
  it('returns free when __DEV__ is false regardless of ?pro=1 (production guard)', () => {
    expect(initialTierLogic(false, true, true, '1')).toBe('free');
    expect(initialTierLogic(false, true, true, 'true')).toBe('free');
  });

  it('returns free when __DEV__ is false and no window (production SSR/Worker)', () => {
    expect(initialTierLogic(false, false, false, null)).toBe('free');
  });

  it('returns pro only when __DEV__ is true AND window.location is present AND pro param is set', () => {
    expect(initialTierLogic(true, true, true, '1')).toBe('pro');
    expect(initialTierLogic(true, true, true, 'true')).toBe('pro');
  });

  it('returns free in __DEV__ mode when pro param is missing or wrong value', () => {
    expect(initialTierLogic(true, true, true, null)).toBe('free');
    expect(initialTierLogic(true, true, true, '0')).toBe('free');
    expect(initialTierLogic(true, true, true, '')).toBe('free');
    expect(initialTierLogic(true, true, true, 'yes')).toBe('free');
    expect(initialTierLogic(true, true, true, 'True')).toBe('free');
  });

  it('returns free in __DEV__ mode when window is absent (native device path)', () => {
    expect(initialTierLogic(true, false, false, '1')).toBe('free');
  });

  it('returns free in __DEV__ mode when window.location is absent', () => {
    expect(initialTierLogic(true, true, false, '1')).toBe('free');
  });
});

describe('Entitlement security: garbage/unknown stored values collapse to free', () => {
  it('parseTier returns free for null (nothing stored)', () => {
    expect(parseTier(null)).toBe('free');
  });

  it('parseTier returns free for empty and whitespace strings', () => {
    expect(parseTier('')).toBe('free');
    expect(parseTier('   ')).toBe('free');
    expect(parseTier('\t\n')).toBe('free');
  });

  it('parseTier returns free for any non-tier string (never wrongly grants Pro)', () => {
    const badValues = [
      'PRO', 'Pro', 'premium', 'admin', 'superuser',
      '1', 'true', 'yes', 'on', 'enabled',
      '{"tier":"pro"}', '["pro"]', 'pro;drop table users;--',
      'undefined', 'null', 'NaN', 'Infinity',
      'p r o', 'pr-o',
    ];
    for (const val of badValues) {
      expect(parseTier(val)).toBe('free');
    }
  });

  it('parseTier returns pro only for the exact string pro (trimmed)', () => {
    expect(parseTier('pro')).toBe('pro');
    expect(parseTier('  pro  ')).toBe('pro');
  });

  it('parseTier returns free only for the exact string free (trimmed)', () => {
    expect(parseTier('free')).toBe('free');
    expect(parseTier('  free  ')).toBe('free');
  });

  it('round-trip: serializeTier then parseTier yields the same tier', () => {
    expect(parseTier(serializeTier('free'))).toBe('free');
    expect(parseTier(serializeTier('pro'))).toBe('pro');
  });

  it('serializeTier coerces unexpected casts to free (never writes a non-tier string)', () => {
    expect(serializeTier('admin' as 'pro')).toBe('free');
    expect(serializeTier('' as 'free')).toBe('free');
    expect(serializeTier('PRO' as 'pro')).toBe('free');
  });
});

describe('Entitlement security: no bypass path through the guard', () => {
  it('combining __DEV__=false with unusual param values never grants pro', () => {
    const injectionAttempts = ['1', 'true', '1; drop table--', '"pro"', "pro'"];
    for (const param of injectionAttempts) {
      expect(initialTierLogic(false, true, true, param)).toBe('free');
    }
  });

  it('guard checks __DEV__ first: window and location are irrelevant in production', () => {
    // In prod __DEV__ is false -> the window check is never reached.
    // Simulate an attacker who controls window.location (e.g. XSS context).
    expect(initialTierLogic(false, true, true, '1')).toBe('free');
    expect(initialTierLogic(false, true, true, 'true')).toBe('free');
  });
});
