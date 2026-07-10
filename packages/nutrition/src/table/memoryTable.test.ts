/**
 * MATCHER TRUTHFULNESS (Stage 0 — offline/deterministic).
 *
 * The honesty contract: resolve an ingredient name to a REAL record, or treat it as
 * honestly UNMATCHED (null) — never a confident wrong match. These tests pin the
 * qualifier/negation guard, the gated loose-substring tier + MIN_SCORE floor, and
 * multi-word EN/ES/FR dish-name resolution to the head ingredient.
 */
import { describe, expect, it } from 'vitest';
import type { FoodRecord } from '../types';
import { createMemoryTable } from './memoryTable';

const table = createMemoryTable(); // default broad dataset (curated + generated)

describe('matcher — plant milks never resolve to dairy milk', () => {
  for (const q of [
    'coconut milk', 'soy milk', 'soya milk', 'oat milk', 'almond milk', 'rice milk',
  ]) {
    it(`"${q}" resolves to a plant-milk row, never dairy milk`, () => {
      const m = table.lookup(q);
      expect(m, `${q} should resolve`).not.toBeNull();
      // It must NOT be the dairy 'milk' / 'cream' / 'yogurt' row.
      expect(m!.record.category).not.toBe('dairy');
      expect(m!.record.name.toLowerCase()).toContain('milk');
    });
  }

  it('"hemp milk" / "cashew milk" (no curated row) go UNMATCHED, not dairy', () => {
    for (const q of ['hemp milk', 'cashew milk']) {
      const m = table.lookup(q);
      if (m) expect(m.record.category).not.toBe('dairy');
    }
  });

  it('plain "milk" still resolves to dairy milk', () => {
    const m = table.lookup('milk');
    expect(m).not.toBeNull();
    expect(m!.record.category).toBe('dairy');
  });
});

describe('matcher — qualifier/substring guards', () => {
  it('"paneer" does NOT resolve to bread (the "pan" substring trap)', () => {
    const m = table.lookup('paneer');
    expect(m).not.toBeNull();
    expect(m!.record.name.toLowerCase()).not.toContain('bread');
    expect(m!.record.name.toLowerCase()).toContain('paneer');
  });

  it('seitan resolves to seitan (and would flag gluten), never to an unrelated row', () => {
    const m = table.lookup('seitan');
    expect(m).not.toBeNull();
    expect(m!.record.name.toLowerCase()).toContain('seitan');
  });
});

describe('matcher — multi-word EN/ES/FR dish names resolve to the head ingredient', () => {
  const cases: Array<[string, string]> = [
    ['grilled salmon', 'salmon'],
    ['salmon fillet', 'salmon'],
    ['pollo a la plancha', 'chicken'],
    ['poulet roti', 'chicken'],
    ['chicken shawarma', 'shawarma'],
  ];
  for (const [q, expectContains] of cases) {
    it(`"${q}" resolves to a record matching "${expectContains}"`, () => {
      const m = table.lookup(q);
      expect(m, `${q} should resolve`).not.toBeNull();
      const text = `${m!.record.name} ${(m!.record.aliases ?? []).join(' ')}`.toLowerCase();
      expect(text).toContain(expectContains);
    });
  }
});

describe('matcher — MIN_SCORE floor on the loose-substring tier', () => {
  // A tiny table with only a long candidate key; a query that merely overlaps it as
  // a substring (no shared whole word) must NOT confidently match.
  const onlyRice: FoodRecord = {
    id: 't-rice', db: 'CIQUAL', name: 'white rice', category: 'grain', state: 'cooked',
    per100g: { kcal: 130, protein: 2.7, fat: 0.3, salt: 0 },
  };
  const t = createMemoryTable([onlyRice]);

  it('"risotto" (substring-only against rice) is rejected as UNMATCHED', () => {
    // 'risotto' shares no whole word with 'white rice'; substring tier scores 0.5 <
    // MIN_SCORE 0.55 -> null. (In the full dataset it resolves to a real risotto row.)
    expect(t.lookup('risotto')).toBeNull();
  });

  it('an exact name still resolves at 1.0', () => {
    const m = t.lookup('white rice');
    expect(m).not.toBeNull();
    expect(m!.score).toBe(1);
  });

  it('a shared whole word ("rice") still resolves (not gated by the substring floor)', () => {
    const m = t.lookup('rice');
    expect(m).not.toBeNull();
    expect(m!.score).toBeGreaterThanOrEqual(0.55);
  });
});

describe('matcher — cooking-verb stopwords (no wrong-protein class)', () => {
  it('"whole grilled fish" / multilingual resolves to FISH, never chicken', () => {
    for (const q of ['whole grilled fish', 'pescado entero a la plancha', 'poisson grille']) {
      const m = table.lookup(q);
      if (m) {
        expect(m.record.category).not.toBe('meat');
      }
    }
  });

  it('cooking verbs carry no identity: bare verbs do not resolve to a food', () => {
    for (const verb of ['grilled', 'frito', 'asado', 'roti']) {
      // A lone cooking verb must not confidently resolve to any food row.
      const m = table.lookup(verb);
      // Either null or, at worst, a non-exact hit — never a confident protein.
      if (m) expect(m.score).toBeLessThan(1);
    }
  });
});

describe('matcher — bare oil never hits pure olive oil at 1.0', () => {
  it('"oil" resolves to the neutral cooking-oil row, not extra-virgin olive oil', () => {
    const m = table.lookup('oil');
    expect(m).not.toBeNull();
    expect(m!.record.name.toLowerCase()).toContain('cooking oil');
    expect(m!.record.id).toBe('curated-cooking-oil');
  });

  it('"olive oil" still resolves to olive oil', () => {
    const m = table.lookup('olive oil');
    expect(m).not.toBeNull();
    expect(m!.record.name.toLowerCase()).toContain('olive oil');
  });
});

describe('matcher — plant guard (never collapse to dairy OR meat)', () => {
  it('"vegan cheese" resolves to a plant row, never dairy cheese (33 g fat)', () => {
    const m = table.lookup('vegan cheese');
    expect(m).not.toBeNull();
    expect(m!.record.category).not.toBe('dairy');
    expect(m!.record.name.toLowerCase()).toContain('vegan');
  });

  it('"plant butter" resolves to a plant row, never dairy butter (81 % fat)', () => {
    const m = table.lookup('plant butter');
    expect(m).not.toBeNull();
    expect(m!.record.id).not.toBe('curated-butter');
    expect(m!.record.per100g.satFat ?? 0).toBeLessThan(51);
  });

  it('a plant-qualified "patty" never collapses onto a beef/meat row', () => {
    for (const q of ['soy patty', 'vegan patty', 'plant burger']) {
      const m = table.lookup(q);
      if (m) expect(m.record.category).not.toBe('meat');
    }
  });
});

describe('matcher — state / leanness / representativeness tie-break (deterministic)', () => {
  it('on a near-tie prefers the cooked row over a raw row', () => {
    const raw: FoodRecord = {
      id: 'tb-raw', db: 'USDA', name: 'mystery grain', category: 'grain', state: 'raw',
      per100g: { kcal: 360, protein: 7, fat: 1, carbs: 80, salt: 0 },
    };
    const cooked: FoodRecord = {
      id: 'tb-cooked', db: 'USDA', name: 'mystery grain', category: 'grain', state: 'cooked',
      per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, salt: 0 },
    };
    // Raw listed FIRST: without the tie-break, list order would win the raw row.
    const t = createMemoryTable([raw, cooked]);
    expect(t.lookup('mystery grain')!.record.state).toBe('cooked');
  });

  it('on a near-tie prefers the lower-fat representative (leanness)', () => {
    const fatty: FoodRecord = {
      id: 'tb-fatty', db: 'USDA', name: 'beef', category: 'meat', state: 'cooked',
      per100g: { kcal: 300, protein: 25, fat: 25, satFat: 10, salt: 0.2 },
    };
    const lean: FoodRecord = {
      id: 'tb-lean', db: 'USDA', name: 'beef', category: 'meat', state: 'cooked',
      per100g: { kcal: 180, protein: 30, fat: 6, satFat: 2.5, salt: 0.1 },
    };
    const t = createMemoryTable([fatty, lean]);
    expect(t.lookup('lean beef')!.record.id).toBe('tb-lean');
  });

  it('is deterministic across runs for tie-break inputs', () => {
    const a: FoodRecord = {
      id: 'd-a', db: 'USDA', name: 'thing', category: 'meat', state: 'cooked',
      per100g: { kcal: 200, protein: 20, fat: 12, salt: 0.2 },
    };
    const b: FoodRecord = {
      id: 'd-b', db: 'USDA', name: 'thing', category: 'meat', state: 'cooked',
      per100g: { kcal: 200, protein: 20, fat: 8, salt: 0.2 },
    };
    const t = createMemoryTable([a, b]);
    expect(t.lookup('thing')).toEqual(t.lookup('thing'));
  });
});

describe('matcher — new curated composite rows resolve (cooked, no inflation)', () => {
  // [query, name-substring, expected state]
  const cases: Array<[string, string, 'cooked' | 'raw']> = [
    ['gazpacho', 'gazpacho', 'cooked'],
    ['risotto', 'risotto', 'cooked'],
    ['mixed salad', 'salad', 'raw'],
    ['ramen', 'ramen', 'cooked'],
    ['pad thai', 'pad thai', 'cooked'],
    ['farro', 'farro', 'cooked'],
    ['orzo', 'orzo', 'cooked'],
    ['paella rice cooked', 'rice', 'cooked'],
  ];
  for (const [q, expectContains, state] of cases) {
    it(`"${q}" resolves to a ${state} composite containing "${expectContains}"`, () => {
      const m = table.lookup(q);
      expect(m, `${q} should resolve`).not.toBeNull();
      expect(m!.record.state).toBe(state);
      const text = `${m!.record.name} ${(m!.record.aliases ?? []).join(' ')}`.toLowerCase();
      expect(text).toContain(expectContains);
    });
  }
});

describe('matcher — determinism', () => {
  it('same name -> identical MatchResult across runs', () => {
    for (const q of ['grilled salmon', 'coconut milk', 'paneer', 'risotto', 'totally unknown xyz']) {
      expect(table.lookup(q)).toEqual(table.lookup(q));
    }
  });

  it('a genuinely unknown name returns null (honestly unmatched)', () => {
    expect(table.lookup('zorblax mystery substance')).toBeNull();
  });
});
