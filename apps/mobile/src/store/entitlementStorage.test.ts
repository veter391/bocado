/**
 * Unit tests for the PURE serialization layer of the entitlement store.
 *
 * NODE-only: imports ONLY `serializeTier` / `parseTier`. It must never import
 * `expo-secure-store` or any React Native module — the device-storage wrappers import
 * SecureStore lazily, so they are deliberately not exercised here.
 *
 * Guarantees pinned:
 *   1. Round-trip: serialize → parse yields the same tier.
 *   2. `parseTier(null)` and any unknown / malformed value collapse to the safe
 *      default 'free' — a returning user is never wrongly granted Pro from garbage.
 *   3. Whitespace is tolerated on read.
 */
import { describe, expect, it } from 'vitest';
import { parseTier, serializeTier, type EntitlementTier } from './entitlementStorage';

describe('serializeTier / parseTier', () => {
  it('round-trips both tiers', () => {
    expect(parseTier(serializeTier('free'))).toBe('free');
    expect(parseTier(serializeTier('pro'))).toBe('pro');
  });

  it('parseTier(null) is the safe default free', () => {
    expect(parseTier(null)).toBe('free');
  });

  it('unknown / malformed values collapse to free (never wrongly grant Pro)', () => {
    expect(parseTier('')).toBe('free');
    expect(parseTier('   ')).toBe('free');
    expect(parseTier('PRO')).toBe('free');
    expect(parseTier('premium')).toBe('free');
    expect(parseTier('{"tier":"pro"}')).toBe('free');
    expect(parseTier('true')).toBe('free');
  });

  it('tolerates surrounding whitespace on a valid value', () => {
    expect(parseTier('  pro  ')).toBe('pro');
    expect(parseTier('\nfree\t')).toBe('free');
  });

  it('serializeTier coerces an unexpected value to free', () => {
    // Defensive: even if a caller forces a bad cast, we never write a non-tier string.
    expect(serializeTier('nope' as EntitlementTier)).toBe('free');
  });
});
