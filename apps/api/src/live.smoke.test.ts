/**
 * LIVE smoke test — hits the REAL WaveSpeed API (paid). It is gated behind
 * `BOCADO_LIVE=1`, so the normal `pnpm test` NEVER runs it (no accidental spend).
 * Run it explicitly:
 *   BOCADO_LIVE=1 pnpm --filter @bocado/api exec vitest run src/live.smoke.test.ts
 *
 * It reads the key from apps/api/.dev.vars (never the command line), perceives a
 * real menu photo via MiniMax M3, runs the deterministic engine, and generates one
 * dish image — printing the latency of each leg for the speed measurement.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

import { assessSuitability, detectAllergens, estimateNutrition, rateNutrients, seedTable } from '@bocado/nutrition';

import type { Env } from './env';
import { perceiveMenu } from './perception/client';
import { makeWavespeedProvider } from './image/providers';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Read WAVESPEED_API_KEY from apps/api/.dev.vars (keeps it off the command line). */
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

function liveEnv(): Env {
  return {
    WAVESPEED_API_KEY: KEY,
    ENVIRONMENT: 'development',
    PERCEPTION_BASE_URL: 'https://llm.wavespeed.ai/v1',
    AI_GATEWAY_BASE_URL: 'unused',
    PERCEPTION_MODEL: 'minimax/minimax-m3',
    PERCEPTION_MODEL_FALLBACK: 'minimax/minimax-01',
    IMAGE_PROVIDER: 'wavespeed',
    WAVESPEED_MODEL: 'wavespeed-ai/flux-schnell',
    // AI binding not needed unless the WaveSpeed image call fails (FLUX fallback).
    AI: { run: async () => { throw new Error('FLUX fallback not available in smoke test'); } },
  } as unknown as Env;
}

describe.runIf(LIVE)('LIVE WaveSpeed end-to-end (paid)', () => {
  it('perceives a real menu photo with MiniMax M3 and runs the engine', async () => {
    const jpeg = readFileSync(path.join(HERE, '__fixtures__', 'menu.jpeg'));
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;

    const t0 = Date.now();
    const menu = await perceiveMenu(dataUrl, liveEnv(), { locale: 'en', timeoutMs: 60_000 });
    const perceptionMs = Date.now() - t0;

    // eslint-disable-next-line no-console
    console.log(`\n[PERCEPTION] MiniMax M3 took ${perceptionMs} ms — ${menu.dishes.length} dishes, title=${menu.title ?? '(none)'}`);
    expect(menu.dishes.length).toBeGreaterThan(3);

    // Run the deterministic engine over each perceived dish -> verdict + lights.
    // Pass the perceived cookingMethod so the engine applies the right added-fat
    // allowance + yield (the accuracy fix). M3 = structuring only; math is ours.
    for (const d of menu.dishes.slice(0, 12)) {
      const nutrition = estimateNutrition(d.ingredients, seedTable, { cookingMethod: d.cookingMethod });
      const suitability = assessSuitability({ nutrition, context: 'dinner', ingredients: d.ingredients });
      const allergens = detectAllergens(d.ingredients).map((a) => a.allergen);
      const lightStr = rateNutrients(nutrition)
        .map((l) => `${l.key.charAt(0).toUpperCase()}${l.level === 'high' ? 'R' : l.level === 'caution' ? 'a' : 'g'}`)
        .join(' ');
      const flag = suitability.uncertain ? `UNCERTAIN(${suitability.confidence})` : suitability.confidence;
      // eslint-disable-next-line no-console
      console.log(
        `  • ${d.translatedName.padEnd(22)} ${(d.cookingMethod ?? '?').padEnd(10)} ${suitability.level.toUpperCase().padEnd(7)} ` +
        `"${suitability.label}"  ${Math.round(nutrition.kcal.min)}-${Math.round(nutrition.kcal.max)}kcal fat${Math.round(nutrition.fat.min)}-${Math.round(nutrition.fat.max)}g [${lightStr}] ${flag}`,
      );
    }
  }, 90_000);

  it('generates one dish image via WaveSpeed flux-schnell', async () => {
    const provider = makeWavespeedProvider(globalThis.fetch, { pollDelayMs: 700, maxPolls: 40 });
    const t0 = Date.now();
    const img = await provider.generate(
      'A clean, appetising overhead photo of "Paella de marisco" on a plain plate, soft natural light, no text',
      liveEnv(),
    );
    const imageMs = Date.now() - t0;

    // eslint-disable-next-line no-console
    console.log(`\n[IMAGE] ${img.modelLabel} took ${imageMs} ms — ${img.bytes.byteLength} bytes`);
    expect(img.bytes.byteLength).toBeGreaterThan(1000);

    // Save it so we can eyeball quality.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(HERE, '__fixtures__', 'generated-dish.png'), img.bytes);
  }, 90_000);
});

// Always-present guard so the file is a valid suite even when LIVE is off.
describe.skipIf(LIVE)('LIVE smoke (skipped)', () => {
  it('is skipped unless BOCADO_LIVE=1 and a key is present', () => {
    expect(true).toBe(true);
  });
});
