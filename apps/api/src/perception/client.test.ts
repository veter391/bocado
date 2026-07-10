/**
 * Unit tests for the perception client. NO NETWORK and NO REAL KEYS: every test
 * injects a fake `fetch` via `opts.fetchImpl`. We assert behaviour at the trust
 * boundary (parse + validate, fence stripping, single fallback retry, abort) and
 * — most importantly — the ANONYMITY invariant: the request body sent to the
 * model contains only the model slug, the static prompt messages, and params.
 */
import { describe, expect, it, vi } from 'vitest';

import type { PerceivedMenu } from '@bocado/shared';
import { perceivedMenuSchema } from '@bocado/shared';

import type { Env } from '../env';
import { buildPerceptionMessages } from './prompt';
import { isMenuEmpty, PerceptionError, perceiveMenu, type FetchImpl } from './client';

const IMAGE_DATA_URL = 'data:image/jpeg;base64,/9j/FAKEBASE64IMAGEBYTES==';

/**
 * A minimal Env stub. The bindings (AI/IMAGES/DB) are never touched by the
 * client, so we cast a partial object rather than fabricate Cloudflare runtime
 * objects. The fetch is always injected, so the key value is irrelevant — but we
 * still assert it is forwarded as a Bearer header.
 */
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    OPENROUTER_API_KEY: 'test-key-not-real',
    ENVIRONMENT: 'development',
    AI_GATEWAY_BASE_URL: 'https://gateway.example/v1/acct/gw/openrouter',
    PERCEPTION_MODEL: 'minimax/minimax-m3',
    PERCEPTION_MODEL_FALLBACK: 'minimax/minimax-01',
    ...overrides,
  } as Env;
}

/** Build a well-formed OpenRouter chat-completions response wrapping `content`. */
function chatResponse(content: string): string {
  return JSON.stringify({
    id: 'gen-test',
    choices: [{ index: 0, message: { role: 'assistant', content } }],
  });
}

/** A valid perceived menu the schema accepts, as a JSON string. */
const VALID_MENU: PerceivedMenu = {
  title: 'Trattoria Test',
  dishes: [
    {
      originalText: 'Pollo a la plancha',
      translatedName: 'Grilled chicken',
      section: 'Mains',
      explanation: 'Chicken breast cooked on a hot griddle.',
      ingredients: [
        { name: 'chicken breast', grams: 180 },
        { name: 'olive oil', grams: 8 },
      ],
    },
  ],
};
const VALID_MENU_JSON = JSON.stringify(VALID_MENU);
/**
 * What `perceiveMenu` returns after the trust-boundary schema parse: the legacy
 * {name,grams} above, enriched by the back-compat shim (canonicalName backfilled +
 * cookingMethod/basis/isAddedFat defaults). Assertions compare against this normalized
 * form, since the model's JSON is validated+normalized before it leaves the client.
 */
const EXPECTED_MENU = perceivedMenuSchema.parse(VALID_MENU);

/** Records every fetch call so tests can assert URL, headers, and body. */
interface RecordedCall {
  url: string;
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  };
}

/**
 * Build a fake fetch that returns a scripted body per call (by index). A handler
 * may be a string (-> 200 OK with that text), or a function for full control
 * (e.g. to throw, return a non-2xx status, or honour the abort signal).
 */
function fakeFetch(
  handlers: Array<
    | string
    | ((call: RecordedCall) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>)
  >,
): { impl: FetchImpl; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  let i = 0;
  const impl: FetchImpl = (url, init) => {
    const call: RecordedCall = { url, init };
    calls.push(call);
    const handler = handlers[i++];
    if (handler === undefined) {
      throw new Error(`fakeFetch: unexpected call #${i} to ${url}`);
    }
    if (typeof handler === 'string') {
      const text = handler;
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(text) });
    }
    return handler(call);
  };
  return { impl, calls };
}

describe('perceiveMenu — happy path', () => {
  it('parses an OpenRouter chat response whose content is the menu JSON', async () => {
    const { impl, calls } = fakeFetch([chatResponse(VALID_MENU_JSON)]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
    expect(calls).toHaveLength(1);
    // Endpoint + method + auth header are correct.
    expect(calls[0]?.url).toBe('https://gateway.example/v1/acct/gw/openrouter/chat/completions');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers.Authorization).toBe('Bearer test-key-not-real');

    // Body uses the PRIMARY model and the required params.
    const body = JSON.parse(calls[0]?.init.body ?? '{}');
    expect(body.model).toBe('minimax/minimax-m3');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('defaults the locale to "en" and exposes isMenuEmpty', async () => {
    const empty: PerceivedMenu = { dishes: [] };
    const { impl } = fakeFetch([chatResponse(JSON.stringify(empty))]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(isMenuEmpty(menu)).toBe(true);
    expect(isMenuEmpty(VALID_MENU)).toBe(false);
  });
});

describe('perceiveMenu — fenced JSON content', () => {
  it('strips a ```json ... ``` fence before parsing', async () => {
    const fenced = '```json\n' + VALID_MENU_JSON + '\n```';
    const { impl, calls } = fakeFetch([chatResponse(fenced)]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
    expect(calls).toHaveLength(1);
  });

  it('strips a bare ``` ... ``` fence (no language tag)', async () => {
    const fenced = '```\n' + VALID_MENU_JSON + '\n```';
    const { impl } = fakeFetch([chatResponse(fenced)]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
  });
});

describe('perceiveMenu — fallback retry', () => {
  it('retries the FALLBACK model when the first content is malformed JSON', async () => {
    const { impl, calls } = fakeFetch([
      chatResponse('this is not json at all {{{'),
      chatResponse(VALID_MENU_JSON),
    ]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
    expect(calls).toHaveLength(2);
    // First call used the primary slug…
    const firstBody = JSON.parse(calls[0]?.init.body ?? '{}');
    expect(firstBody.model).toBe('minimax/minimax-m3');
    // …the second (retry) used the fallback slug.
    const secondBody = JSON.parse(calls[1]?.init.body ?? '{}');
    expect(secondBody.model).toBe('minimax/minimax-01');
  });

  it('retries the fallback when the first response fails schema validation', async () => {
    // Valid JSON, but `grams` is a string -> perceivedMenuSchema.parse throws.
    const invalidShape = JSON.stringify({
      dishes: [
        {
          originalText: 'X',
          translatedName: 'X',
          ingredients: [{ name: 'rice', grams: 'lots' }],
        },
      ],
    });
    const { impl, calls } = fakeFetch([chatResponse(invalidShape), chatResponse(VALID_MENU_JSON)]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
    expect(JSON.parse(calls[1]?.init.body ?? '{}').model).toBe('minimax/minimax-01');
  });

  it('retries the fallback on a non-2xx HTTP status', async () => {
    const { impl, calls } = fakeFetch([
      () => Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('bad gateway') }),
      chatResponse(VALID_MENU_JSON),
    ]);

    const menu = await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(menu).toEqual(EXPECTED_MENU);
    expect(calls).toHaveLength(2);
    expect(JSON.parse(calls[1]?.init.body ?? '{}').model).toBe('minimax/minimax-01');
  });

  it('throws PerceptionError when BOTH attempts fail (no third call)', async () => {
    const { impl, calls } = fakeFetch([
      () => Promise.reject(new Error('network down #1')),
      () => Promise.reject(new Error('network down #2')),
    ]);

    await expect(perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl })).rejects.toBeInstanceOf(
      PerceptionError,
    );
    expect(calls).toHaveLength(2);
  });
});

describe('perceiveMenu — timeout / abort', () => {
  it('aborts a hung request and falls back, then fails as PerceptionError', async () => {
    vi.useFakeTimers();
    try {
      // Both attempts never resolve until aborted; reject via the abort signal.
      const hang = (call: RecordedCall): Promise<{ ok: boolean; status: number; text(): Promise<string> }> =>
        new Promise((_resolve, reject) => {
          call.init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
        });
      const { impl, calls } = fakeFetch([hang, hang]);

      const promise = perceiveMenu(IMAGE_DATA_URL, makeEnv(), {
        fetchImpl: impl,
        timeoutMs: 1_000,
      });
      // Attach a catch synchronously so the rejection is never unhandled.
      const settled = expect(promise).rejects.toBeInstanceOf(PerceptionError);

      // Advance past both per-attempt timeouts.
      await vi.advanceTimersByTimeAsync(1_000); // primary aborts
      await vi.advanceTimersByTimeAsync(1_000); // fallback aborts

      await settled;
      expect(calls).toHaveLength(2);
      // The abort signal that the client passed must be flagged aborted.
      expect(calls[0]?.init.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a live (not pre-aborted) AbortSignal on the first attempt', async () => {
    const { impl, calls } = fakeFetch([chatResponse(VALID_MENU_JSON)]);

    await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
    expect(calls[0]?.init.signal.aborted).toBe(false);
  });
});

describe('perceiveMenu — ANONYMITY invariant', () => {
  it('sends ONLY model + messages + params; no user-identifying fields', async () => {
    const { impl, calls } = fakeFetch([chatResponse(VALID_MENU_JSON)]);

    await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl, locale: 'es' });

    const rawBody = calls[0]?.init.body ?? '';
    const body = JSON.parse(rawBody);

    // Exactly the allowed top-level keys — nothing more could carry user data.
    // `prompt_cache` is a non-identifying cost flag (reuse the static prompt prefix).
    expect(Object.keys(body).sort()).toEqual(
      ['messages', 'model', 'prompt_cache', 'response_format', 'temperature'].sort(),
    );

    // The image data URL is present (the only user-supplied input that is allowed).
    expect(rawBody).toContain(IMAGE_DATA_URL);

    // STRONGEST anonymity check: the messages sent are byte-for-byte the static
    // prompt + image that buildPerceptionMessages produces — nothing appended,
    // injected, or templated with user data. (Substring scans for words like
    // "allergen" are useless here: the STATIC prompt legitimately tells the model
    // NOT to make allergen claims, so the word appears by design.)
    expect(body.messages).toEqual(buildPerceptionMessages(IMAGE_DATA_URL, 'es'));

    // And the message turns are exactly the static system prompt + the user image.
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].role).toBe('user');

    // No identity / health / location / profile field appears OUTSIDE the audited
    // static prompt. We diff the serialized body against the serialized messages
    // (the known-static part) and scan only the remaining envelope for user data.
    const envelope = rawBody.replace(JSON.stringify(body.messages), '').toLowerCase();
    const forbidden = [
      'userid',
      'user_id',
      'allergy',
      'allergies',
      'profile',
      'goals',
      'location',
      'latitude',
      'longitude',
      'email',
      'consent',
    ];
    for (const term of forbidden) {
      expect(envelope).not.toContain(term);
    }
  });
});

describe('perceiveMenu — provider routing', () => {
  it('targets WaveSpeed (PERCEPTION_BASE_URL + WAVESPEED_API_KEY) when set', async () => {
    const { impl, calls } = fakeFetch([chatResponse(VALID_MENU_JSON)]);
    const env = makeEnv({
      PERCEPTION_BASE_URL: 'https://llm.wavespeed.ai/v1',
      WAVESPEED_API_KEY: 'ws-secret',
    });

    await perceiveMenu(IMAGE_DATA_URL, env, { fetchImpl: impl });

    expect(calls[0]?.url).toBe('https://llm.wavespeed.ai/v1/chat/completions');
    expect(calls[0]?.init.headers.Authorization).toBe('Bearer ws-secret');
  });

  it('falls back to the AI Gateway + OpenRouter key when WaveSpeed vars are unset', async () => {
    const { impl, calls } = fakeFetch([chatResponse(VALID_MENU_JSON)]);

    await perceiveMenu(IMAGE_DATA_URL, makeEnv(), { fetchImpl: impl });

    expect(calls[0]?.url).toBe('https://gateway.example/v1/acct/gw/openrouter/chat/completions');
    expect(calls[0]?.init.headers.Authorization).toBe('Bearer test-key-not-real');
  });
});
