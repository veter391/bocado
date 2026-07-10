/**
 * Unit tests for the PURE serialization layer of the saved-dishes store.
 *
 * NODE-only: imports ONLY the pure functions. It must never import `expo-secure-store`
 * or any React Native module — the device-storage wrappers import SecureStore lazily,
 * so they are deliberately not exercised here.
 *
 * Guarantees pinned:
 *   1. Round-trip: serialize → parse preserves the refs.
 *   2. `parseSavedDishes(null)`, empty/whitespace, non-JSON garbage, and a non-array
 *      value all collapse to `[]` — never throw.
 *   3. Individual malformed entries are DROPPED, not thrown.
 *   4. De-dupe by `menuId:dishId`, keeping the first (newest) occurrence.
 */
import { describe, expect, it } from 'vitest';
import {
  parseSavedDishes,
  savedDishKey,
  serializeSavedDishes,
  type SavedDishRef,
} from './savedDishesStorage';

const A: SavedDishRef = {
  menuId: 'menu-1',
  dishId: 'dish-1',
  translatedName: 'Grilled chicken',
  level: 'good',
  savedAt: '2026-06-21T11:00:00.000Z',
};
const B: SavedDishRef = {
  menuId: 'menu-2',
  dishId: 'dish-9',
  translatedName: 'Carbonara',
  level: 'avoid',
  savedAt: '2026-06-21T12:00:00.000Z',
};

describe('serializeSavedDishes / parseSavedDishes', () => {
  it('round-trips a list of refs', () => {
    expect(parseSavedDishes(serializeSavedDishes([A, B]))).toEqual([A, B]);
  });

  it('round-trips an empty list', () => {
    expect(parseSavedDishes(serializeSavedDishes([]))).toEqual([]);
  });

  it('parseSavedDishes(null) is the safe empty list', () => {
    expect(parseSavedDishes(null)).toEqual([]);
  });

  it('empty / whitespace / non-JSON garbage collapse to []', () => {
    expect(parseSavedDishes('')).toEqual([]);
    expect(parseSavedDishes('   ')).toEqual([]);
    expect(parseSavedDishes('not json {')).toEqual([]);
    expect(parseSavedDishes('}{')).toEqual([]);
  });

  it('a non-array JSON value collapses to []', () => {
    expect(parseSavedDishes('null')).toEqual([]);
    expect(parseSavedDishes('42')).toEqual([]);
    expect(parseSavedDishes('"a string"')).toEqual([]);
    expect(parseSavedDishes(JSON.stringify({ menuId: 'm', dishId: 'd' }))).toEqual([]);
  });

  it('drops malformed entries without throwing, keeps valid ones', () => {
    const mixed = JSON.stringify([
      A,
      { menuId: 'm', dishId: 'd' }, // missing fields
      { ...B, level: 'spicy' }, // invalid level
      { ...A, menuId: '' }, // empty id
      B,
    ]);
    expect(parseSavedDishes(mixed)).toEqual([A, B]);
  });

  it('de-dupes by menuId:dishId, keeping the first occurrence', () => {
    const dupe: SavedDishRef = { ...A, translatedName: 'STALE COPY', savedAt: '2020-01-01T00:00:00.000Z' };
    // A first (newest), then a stale dupe of the same key — A must win.
    expect(parseSavedDishes(serializeSavedDishes([A, dupe, B]))).toEqual([A, B]);
  });

  it('savedDishKey is the stable composite identity', () => {
    expect(savedDishKey('menu-1', 'dish-1')).toBe('menu-1:dish-1');
  });
});
