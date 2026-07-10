/**
 * Tests for the dish-image provider seam.
 *
 * No network, no real keys: the Imagen provider's fetch is injected, and FLUX uses a
 * fake `AI.run` (SECURITY.md). We assert:
 *  - Imagen is the DEFAULT when configured, and its model id/region/EU endpoint hold;
 *  - the chain FALLS BACK to FLUX when Imagen is unconfigured (local/no keys);
 *  - the chain falls back to FLUX when Imagen fails at call time;
 *  - each provider reports the right provenance label for the AI-Act marker.
 */
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../env';
import {
  buildProviderChain,
  generateWithFallback,
  FLUX_LABEL,
  IMAGEN_LABEL,
  IMAGEN_MODEL,
  WAVESPEED_BASE_URL,
  WAVESPEED_DEFAULT_MODEL,
} from './providers';

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A fake Workers-AI binding that returns a base64 PNG under `image`. */
function fakeAi() {
  const run = vi.fn(async () => ({ image: PNG_BASE64 }));
  return { run } as unknown as Ai & { run: typeof run };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    ENVIRONMENT: 'development',
    AI: fakeAi(),
    ...overrides,
  } as unknown as Env;
}

/** A fake fetch returning a Vertex `:predict` response with one base64 image. */
function imagenFetchOk() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ predictions: [{ bytesBase64Encoded: PNG_BASE64 }] }), {
      status: 200,
    }),
  ) as unknown as typeof fetch;
}

const VERTEX_ENV: Partial<Env> = {
  IMAGE_PROVIDER: 'imagen',
  VERTEX_PROJECT_ID: 'bocado-eu',
  VERTEX_LOCATION: 'europe-west4',
  VERTEX_ACCESS_TOKEN: 'ya29.fake-token',
};

describe('provider chain selection', () => {
  it('defaults to [imagen, flux] when Imagen is fully configured', () => {
    const chain = buildProviderChain(makeEnv(VERTEX_ENV), imagenFetchOk());
    expect(chain.map((p) => p.id)).toEqual(['imagen', 'flux']);
  });

  it('drops Imagen and uses [flux] when Vertex creds are absent (local/no keys)', () => {
    const chain = buildProviderChain(makeEnv({ IMAGE_PROVIDER: 'imagen' }), imagenFetchOk());
    expect(chain.map((p) => p.id)).toEqual(['flux']);
  });

  it("puts FLUX first when IMAGE_PROVIDER is explicitly 'flux'", () => {
    const chain = buildProviderChain(makeEnv({ ...VERTEX_ENV, IMAGE_PROVIDER: 'flux' }), imagenFetchOk());
    expect(chain.map((p) => p.id)).toEqual(['flux', 'imagen']);
  });
});

describe('generateWithFallback', () => {
  it('uses Imagen 4 Fast by default, hitting the pinned model on the EU region endpoint', async () => {
    const fetchSpy = imagenFetchOk();
    const env = makeEnv(VERTEX_ENV);
    const ai = env.AI as unknown as { run: ReturnType<typeof vi.fn> };

    const out = await generateWithFallback('a plate of paella', env, fetchSpy);

    expect(out.modelLabel).toBe(IMAGEN_LABEL);
    expect(out.bytes.byteLength).toBeGreaterThan(0);
    // FLUX was not used.
    expect(ai.run).not.toHaveBeenCalled();
    // Endpoint encodes the pinned model + EU region + project.
    const calledUrl = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
    expect(calledUrl).toContain(IMAGEN_MODEL);
    expect(calledUrl).toContain('europe-west4-aiplatform.googleapis.com');
    expect(calledUrl).toContain('projects/bocado-eu');
  });

  it('falls back to FLUX when Imagen errors at call time', async () => {
    const failing = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const env = makeEnv(VERTEX_ENV);
    const ai = env.AI as unknown as { run: ReturnType<typeof vi.fn> };

    const out = await generateWithFallback('a plate of paella', env, failing);

    // Imagen attempted, failed; FLUX produced the bytes.
    expect(out.modelLabel).toBe(FLUX_LABEL);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });

  it('uses FLUX directly when Imagen is unconfigured (no network call attempted)', async () => {
    const fetchSpy = imagenFetchOk();
    const env = makeEnv(); // no Vertex creds
    const ai = env.AI as unknown as { run: ReturnType<typeof vi.fn> };

    const out = await generateWithFallback('a plate of paella', env, fetchSpy);

    expect(out.modelLabel).toBe(FLUX_LABEL);
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect((fetchSpy as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('anonymity: only the static prompt reaches Imagen — no user data in the body', async () => {
    const fetchSpy = imagenFetchOk();
    await generateWithFallback('a plate of paella', makeEnv(VERTEX_ENV), fetchSpy);

    const body = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string;
    const parsed = JSON.parse(body) as { instances: Array<{ prompt: string }> };
    expect(parsed.instances[0]!.prompt).toBe('a plate of paella');
    const lower = body.toLowerCase();
    for (const term of ['allerg', 'userid', 'profile', 'location', 'email']) {
      expect(lower).not.toContain(term);
    }
  });
});

describe('WaveSpeed provider', () => {
  const WAVESPEED_ENV: Partial<Env> = { IMAGE_PROVIDER: 'wavespeed', WAVESPEED_API_KEY: 'ws-test-key' };
  const NO_DELAY = { pollDelayMs: 0, maxPolls: 5 };

  /**
   * A fake fetch modelling the submit -> poll -> image-bytes flow:
   *  - POST {base}/{model}            -> { data: { id, urls.get, status: 'created' } }
   *  - GET  {base}/predictions/{id}   -> { data: { status: 'completed', outputs: [imageUrl] } }
   *  - GET  imageUrl                  -> the PNG bytes
   */
  function wavespeedFetchOk(imageUrl = 'https://cdn.wavespeed.ai/out/abc.png') {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') {
        return new Response(
          JSON.stringify({
            data: { id: 'pred_abc', status: 'created', urls: { get: `${WAVESPEED_BASE_URL}/predictions/pred_abc` } },
          }),
          { status: 200 },
        );
      }
      if (url === imageUrl) {
        return new Response(Uint8Array.from(atob(PNG_BASE64), (ch) => ch.charCodeAt(0)), { status: 200 });
      }
      // poll URL
      return new Response(
        JSON.stringify({ data: { status: 'completed', outputs: [imageUrl] } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
  }

  it('is configured only when WAVESPEED_API_KEY is set and leads the chain when preferred', () => {
    const chain = buildProviderChain(makeEnv(WAVESPEED_ENV), wavespeedFetchOk(), NO_DELAY);
    expect(chain.map((p) => p.id)).toEqual(['wavespeed', 'flux']);

    const noKey = buildProviderChain(makeEnv({ IMAGE_PROVIDER: 'wavespeed' }), wavespeedFetchOk(), NO_DELAY);
    expect(noKey.map((p) => p.id)).toEqual(['flux']);
  });

  it('submits, polls to completion, and returns the produced image bytes + provenance label', async () => {
    const fetchSpy = wavespeedFetchOk();
    const env = makeEnv(WAVESPEED_ENV);
    const ai = env.AI as unknown as { run: ReturnType<typeof vi.fn> };

    const out = await generateWithFallback('a plate of paella', env, fetchSpy, NO_DELAY);

    expect(out.modelLabel).toBe(`wavespeed:${WAVESPEED_DEFAULT_MODEL}`);
    expect(out.bytes.byteLength).toBeGreaterThan(0);
    expect(ai.run).not.toHaveBeenCalled(); // FLUX not used
    // First call is the submit POST to the default model path.
    const calls = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe(`${WAVESPEED_BASE_URL}/${WAVESPEED_DEFAULT_MODEL}`);
    expect((calls[0]![1] as RequestInit).method).toBe('POST');
  });

  it('uses the configured WAVESPEED_MODEL in the submit URL', async () => {
    const fetchSpy = wavespeedFetchOk();
    const env = makeEnv({ ...WAVESPEED_ENV, WAVESPEED_MODEL: 'google/nano-banana-2' });
    await generateWithFallback('a plate of paella', env, fetchSpy, NO_DELAY);
    const calls = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe(`${WAVESPEED_BASE_URL}/google/nano-banana-2`);
  });

  it('anonymity: only the static prompt reaches WaveSpeed — no user data in the submit body', async () => {
    const fetchSpy = wavespeedFetchOk();
    await generateWithFallback('a plate of paella', makeEnv(WAVESPEED_ENV), fetchSpy, NO_DELAY);
    const body = (fetchSpy as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body as string;
    expect(JSON.parse(body)).toEqual({ prompt: 'a plate of paella' });
    const lower = body.toLowerCase();
    for (const term of ['allerg', 'userid', 'profile', 'location', 'email']) {
      expect(lower).not.toContain(term);
    }
  });

  it('falls back to FLUX when the WaveSpeed task fails', async () => {
    const failing = vi.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return new Response(JSON.stringify({ data: { id: 'p1', urls: { get: `${WAVESPEED_BASE_URL}/predictions/p1` } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { status: 'failed', error: 'nsfw' } }), { status: 200 });
    }) as unknown as typeof fetch;
    const env = makeEnv(WAVESPEED_ENV);
    const ai = env.AI as unknown as { run: ReturnType<typeof vi.fn> };

    const out = await generateWithFallback('a plate of paella', env, failing, NO_DELAY);
    expect(out.modelLabel).toBe(FLUX_LABEL);
    expect(ai.run).toHaveBeenCalledTimes(1);
  });
});
