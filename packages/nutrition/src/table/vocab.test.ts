/**
 * Build-time CONTRACT for the canonical vocabulary + the shared coarse-category map.
 *
 * Directive K: every canonicalName the perception prompt advertises must actually
 * resolve against the table (no advertising a word the engine can't match), and the
 * runtime FDC category mapper must agree with the build-time ingest classification.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryTable } from './memoryTable';
import {
  CANONICAL_VOCABULARY,
  COARSE_CATEGORIES,
  coarseCategoryFromUsdaGroup,
  isCanonicalName,
} from './vocab';

const table = createMemoryTable();

describe('CANONICAL_VOCABULARY — every advertised word resolves', () => {
  it('is non-empty and deterministic (sorted, deduped)', () => {
    expect(CANONICAL_VOCABULARY.length).toBeGreaterThan(50);
    const sorted = [...CANONICAL_VOCABULARY].sort();
    expect(CANONICAL_VOCABULARY).toEqual(sorted);
    expect(new Set(CANONICAL_VOCABULARY).size).toBe(CANONICAL_VOCABULARY.length);
  });

  it('every vocabulary entry resolves to a real record (the prompt never lies)', () => {
    const unresolved = CANONICAL_VOCABULARY.filter((name) => table.lookup(name) === null);
    expect(unresolved, `unresolved canonical names: ${unresolved.join(', ')}`).toEqual([]);
  });

  it('isCanonicalName is case-insensitive', () => {
    expect(isCanonicalName('OLIVE OIL')).toBe(true);
    expect(isCanonicalName('definitely not a food xyz')).toBe(false);
  });
});

describe('coarseCategoryFromUsdaGroup — matches the build-time ingest classes', () => {
  it('maps known USDA group ids to the coarse vocabulary', () => {
    expect(coarseCategoryFromUsdaGroup('13', 'Beef, ground')).toBe('meat');
    expect(coarseCategoryFromUsdaGroup('20', 'Rice, white, cooked')).toBe('grain');
    expect(coarseCategoryFromUsdaGroup('16', 'Lentils, cooked')).toBe('legume');
    expect(coarseCategoryFromUsdaGroup('11', 'Broccoli')).toBe('vegetable');
  });

  it('applies name refinements (egg / seafood / oil) before the group map', () => {
    expect(coarseCategoryFromUsdaGroup('1', 'Egg, whole, cooked')).toBe('egg'); // group 1 = dairy/egg
    expect(coarseCategoryFromUsdaGroup('15', 'Shrimp, cooked')).toBe('seafood'); // group 15 = finfish
    expect(coarseCategoryFromUsdaGroup('4', 'Olive oil')).toBe('oil');
  });

  it('falls back to "other" for an unknown group, always within the coarse vocabulary', () => {
    const cat = coarseCategoryFromUsdaGroup('999', 'mystery substance');
    expect(cat).toBe('other');
    expect(COARSE_CATEGORIES).toContain(cat);
  });
});
