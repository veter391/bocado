/**
 * LIVE image-model comparison — REAL WaveSpeed calls (paid). Gated by BOCADO_LIVE=1.
 *   BOCADO_LIVE=1 pnpm --filter @bocado/api exec vitest run src/live-images.smoke.test.ts
 *
 * Generates the SAME dish with the SAME prompt across several models so they can be
 * compared on speed + quality + likeness. Saves each PNG to src/__fixtures__/compare-*.png
 * and prints the latency + byte size per model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import type { Env } from './env';
import { makeWavespeedProvider, generateWithFallback } from './image/providers';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readKey(): string {
  try {
    const text = readFileSync(path.join(HERE, '..', '.dev.vars'), 'utf8');
    const line = text.split('\n').find((l) => l.trim().startsWith('WAVESPEED_API_KEY='));
    return line ? line.slice(line.indexOf('=') + 1).trim() : '';
  } catch {
    return '';
  }
}

const KEY = readKey();
const LIVE = process.env.BOCADO_LIVE === '1' && KEY.length > 0;

/**
 * Same dish + SAME ingredient-explicit prompt for every model, so a viewer can judge
 * likeness ("are the real ingredients visible?") on equal footing. The dish is the
 * exact one from the test menu: Paella de marisco.
 */
const PROMPT =
  'A realistic, appetising top-down food photograph of Spanish "paella de marisco" exactly as served in a restaurant: ' +
  'saffron-yellow short-grain rice with whole shell-on prawns, mussels in the shell, clams, rings of squid/calamari, ' +
  'a few green peas and strips of red pepper, a lemon wedge on the side, on a plain white plate, soft natural daylight, ' +
  'shallow depth of field, no text, no watermark, no hands, no cutlery.';

/**
 * Candidate models, each with the params that make it render at a comparable
 * 1:1 ~1024px so the comparison is apples-to-apples (the flux family takes `size`,
 * Imagen takes `aspect_ratio`). `file` is a filesystem-safe label.
 */
const MODELS = [
  { id: 'wavespeed-ai/flux-schnell', file: 'flux-schnell', params: { size: '1024*1024' } },
  { id: 'wavespeed-ai/flux-dev-ultra-fast', file: 'flux-dev-ultra-fast', params: { size: '1024*1024' } },
  { id: 'wavespeed-ai/flux-2-flash/text-to-image', file: 'flux-2-flash', params: { size: '1024*1024' } },
  { id: 'google/imagen4-fast', file: 'imagen4-fast', params: { aspect_ratio: '1:1' } },
];

function envFor(model: string): Env {
  return {
    WAVESPEED_API_KEY: KEY,
    ENVIRONMENT: 'development',
    IMAGE_PROVIDER: 'wavespeed',
    WAVESPEED_MODEL: model,
    AI: { run: async () => { throw new Error('no FLUX fallback in smoke'); } },
  } as unknown as Env;
}

describe.runIf(LIVE)('LIVE image-model comparison (paid)', () => {
  it('generates the same dish across all candidate models (equal 1:1 conditions)', async () => {
    const results: Array<{ model: string; ms: number; bytes: number; ok: boolean; err?: string }> = [];

    for (const m of MODELS) {
      const provider = makeWavespeedProvider(globalThis.fetch, {
        pollDelayMs: 700,
        maxPolls: 60,
        extraParams: m.params,
      });
      const t0 = Date.now();
      try {
        const img = await provider.generate(PROMPT, envFor(m.id));
        const ms = Date.now() - t0;
        writeFileSync(path.join(HERE, '__fixtures__', `fair-${m.file}.png`), img.bytes);
        results.push({ model: m.id, ms, bytes: img.bytes.byteLength, ok: true });
      } catch (e) {
        results.push({ model: m.id, ms: Date.now() - t0, bytes: 0, ok: false, err: String(e) });
      }
    }

    // eslint-disable-next-line no-console
    console.log('\n=== IMAGE MODEL COMPARISON (same dish, same prompt) ===');
    for (const r of results) {
      // eslint-disable-next-line no-console
      console.log(
        r.ok
          ? `  ${r.model.padEnd(40)} ${String(r.ms).padStart(6)} ms   ${(r.bytes / 1024).toFixed(0)} KB`
          : `  ${r.model.padEnd(40)} FAILED  ${r.err}`,
      );
    }

    // At least one model must have produced an image (don't hard-fail on a single
    // bad model id — we WANT to see which work).
    expect(results.some((r) => r.ok)).toBe(true);
  }, 240_000);

  it('TUNED flux-2-flash via the production env path (768*768 + sync) — faster + lighter', async () => {
    // Exercise the REAL production wiring: env -> buildProviderChain -> generateWithFallback.
    const env = {
      WAVESPEED_API_KEY: KEY,
      ENVIRONMENT: 'development',
      IMAGE_PROVIDER: 'wavespeed',
      WAVESPEED_MODEL: 'wavespeed-ai/flux-2-flash/text-to-image',
      WAVESPEED_IMAGE_SIZE: '768*768',
      AI: { run: async () => { throw new Error('no FLUX fallback in smoke'); } },
    } as unknown as Env;

    const t0 = Date.now();
    const img = await generateWithFallback(PROMPT, env, globalThis.fetch, { pollDelayMs: 500, maxPolls: 60 });
    const ms = Date.now() - t0;
    writeFileSync(path.join(HERE, '__fixtures__', 'fair-flux-2-tuned.png'), img.bytes);

    // eslint-disable-next-line no-console
    console.log(`\n[TUNED flux-2-flash 768*768+sync] ${ms} ms   ${(img.bytes.byteLength / 1024).toFixed(0)} KB   label=${img.modelLabel}`);
    expect(img.bytes.byteLength).toBeGreaterThan(1000);
  }, 120_000);
});

describe.skipIf(LIVE)('LIVE image comparison (skipped)', () => {
  it('is skipped unless BOCADO_LIVE=1 and a key is present', () => {
    expect(true).toBe(true);
  });
});
