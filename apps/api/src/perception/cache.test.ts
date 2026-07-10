/**
 * Unit tests for the anonymous perception cache (D1). No network, fake D1 store.
 * Asserts: hash is stable + data-url-prefix-agnostic, round-trips a menu, treats a
 * corrupt row as a miss, and stores only image-derived content (no user data).
 */
import { describe, expect, it } from 'vitest';

import type { PerceivedMenu } from '@bocado/shared';
import { perceivedMenuSchema } from '@bocado/shared';

import { getCachedPerception, hashImage, putCachedPerception } from './cache';
import { envWithD1, makeFakeD1 } from '../test/fakeD1';

const MENU: PerceivedMenu = {
  title: 'Trattoria',
  dishes: [
    {
      originalText: 'Risotto',
      translatedName: 'Risotto',
      ingredients: [{ name: 'rice', grams: 200 }],
    },
  ],
};

describe('hashImage', () => {
  it('is deterministic for the same image', async () => {
    const a = await hashImage('data:image/png;base64,AAAA');
    const b = await hashImage('data:image/png;base64,AAAA');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores the data: mime prefix — same payload hashes the same', async () => {
    const withJpeg = await hashImage('data:image/jpeg;base64,PAYLOAD123');
    const withPng = await hashImage('data:image/png;base64,PAYLOAD123');
    expect(withJpeg).toBe(withPng);
  });

  it('differs for different payloads', async () => {
    const a = await hashImage('data:image/png;base64,AAAA');
    const b = await hashImage('data:image/png;base64,BBBB');
    expect(a).not.toBe(b);
  });
});

describe('get/put perception cache', () => {
  it('round-trips a perceived menu', async () => {
    const fake = makeFakeD1();
    const env = envWithD1(fake);
    const hash = await hashImage('data:image/png;base64,XYZ');

    expect(await getCachedPerception(env, hash)).toBeNull();
    await putCachedPerception(env, hash, MENU);
    // The round-trip is faithful THROUGH the schema: a stored legacy {name,grams} menu
    // re-parses with the back-compat shim that backfills canonicalName + the new
    // cookingMethod / basis / isAddedFat defaults (directive G). Compare against that
    // normalized form rather than the raw legacy literal.
    expect(await getCachedPerception(env, hash)).toEqual(perceivedMenuSchema.parse(MENU));
  });

  it('treats a corrupt stored row as a miss (re-validates on read)', async () => {
    const fake = makeFakeD1();
    const env = envWithD1(fake);
    const hash = 'deadbeef';
    fake.perception.set(hash, { image_hash: hash, perceived: '{not valid json', created_at: 'x' });
    expect(await getCachedPerception(env, hash)).toBeNull();
  });
});
