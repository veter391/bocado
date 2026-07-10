/**
 * Unit tests for the PURE serialization layer of the profile store.
 *
 * NODE-only: this file imports ONLY `serializeProfile` / `parseProfile` (which in
 * turn touch nothing but `@bocado/shared`). It must never import `expo-secure-store`
 * or any React Native module — the device-storage wrappers import SecureStore lazily,
 * so they are deliberately not exercised here.
 *
 * These tests pin three guarantees that matter for correctness + GDPR safety:
 *   1. Round-trip: serialize → parse yields an equal, fully-valid profile (incl. the
 *      `consentHealthDataAt` health-consent timestamp).
 *   2. `parseProfile(null)` and `parseProfile('garbage')` collapse to the safe empty
 *      profile rather than leaking a partial / undefined shape into the store.
 *   3. An invalid `diet` (out-of-enum) is rejected to the safe default — never trust
 *      a malformed stored value.
 */
import { describe, expect, it } from 'vitest';
import type { UserProfile } from '@bocado/shared';
import { emptyProfile, parseProfile, serializeProfile } from './profileStorage';

const SAFE_EMPTY: UserProfile = { diet: 'none', allergies: [], goals: [] };

describe('serializeProfile / parseProfile', () => {
  it('round-trips a full profile, preserving the health-consent timestamp', () => {
    const profile: UserProfile = {
      diet: 'vegan',
      allergies: ['gluten', 'peanuts'],
      goals: ['high-protein', 'low-sodium'],
      consentHealthDataAt: '2026-06-16T10:00:00.000Z',
    };

    const restored = parseProfile(serializeProfile(profile));

    expect(restored).toEqual(profile);
  });

  it('round-trips a minimal profile with no consent and no health data', () => {
    const profile: UserProfile = { diet: 'keto', allergies: [], goals: ['balanced'] };

    const restored = parseProfile(serializeProfile(profile));

    expect(restored).toEqual(profile);
    expect(restored.consentHealthDataAt).toBeUndefined();
  });

  it('returns the safe empty profile for null (nothing stored)', () => {
    expect(parseProfile(null)).toEqual(SAFE_EMPTY);
  });

  it('returns the safe empty profile for an empty / whitespace string', () => {
    expect(parseProfile('')).toEqual(SAFE_EMPTY);
    expect(parseProfile('   ')).toEqual(SAFE_EMPTY);
  });

  it('returns the safe empty profile for non-JSON garbage', () => {
    expect(parseProfile('garbage')).toEqual(SAFE_EMPTY);
    expect(parseProfile('{not valid json')).toEqual(SAFE_EMPTY);
  });

  it('rejects an invalid diet to the safe default', () => {
    const raw = JSON.stringify({ diet: 'carnivore', allergies: [], goals: [] });

    expect(parseProfile(raw)).toEqual(SAFE_EMPTY);
  });

  it('rejects an invalid allergen to the safe default', () => {
    const raw = JSON.stringify({ diet: 'none', allergies: ['shellfish'], goals: [] });

    expect(parseProfile(raw)).toEqual(SAFE_EMPTY);
  });

  it('rejects a non-datetime consent timestamp to the safe default', () => {
    const raw = JSON.stringify({
      diet: 'none',
      allergies: [],
      goals: [],
      consentHealthDataAt: 'yesterday',
    });

    expect(parseProfile(raw)).toEqual(SAFE_EMPTY);
  });

  it('exposes a safe empty profile constant that matches the default shape', () => {
    expect(emptyProfile).toEqual(SAFE_EMPTY);
  });

  it('does not let callers mutate the shared empty profile via parseProfile', () => {
    const a = parseProfile(null);
    a.allergies.push('gluten');
    const b = parseProfile(null);

    expect(b.allergies).toEqual([]);
  });
});
