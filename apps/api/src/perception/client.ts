/**
 * Perception CLIENT — the ONLY code that talks to the third-party vision model.
 *
 * Privacy invariant (ARCHITECTURE.md §0, SECURITY.md §1–§2): the request body
 * carries ONLY the cleaned menu image + the static perception prompt + model
 * params (model slug, temperature, response_format). No user id, no allergies,
 * no location, no goals, no free-text ever reach the model. The body is built
 * exclusively from `buildPerceptionMessages(imageDataUrl, locale)` and the env
 * model slugs — there is no parameter through which caller-supplied user data
 * could be smuggled into the call. The deterministic engine joins user data
 * downstream, on our side, after the model returns.
 *
 * Anti-hallucination invariant (ARCHITECTURE.md §3): the model returns ONLY the
 * perceived menu structure (text + ingredient guesses). Its JSON is validated
 * against `perceivedMenuSchema` at this trust boundary before any engine code
 * touches it — raw model JSON is never trusted.
 */
import type { PerceivedMenu } from '@bocado/shared';
import { MIN_MENU_CONFIDENCE, perceivedMenuSchema } from '@bocado/shared';

import type { Env } from '../env';
import { buildPerceptionMessages } from './prompt';

/** Subset of the WHATWG `fetch` signature this client relies on (for injection in tests). */
export type FetchImpl = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export interface PerceiveOptions {
  /** UI display locale for translatedName/explanation (NOT personal data). Defaults to 'en'. */
  locale?: string;
  /** Abort the call after this many ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Inject a fake fetch for testing. Defaults to the global `fetch`. */
  fetchImpl?: FetchImpl;
}

/**
 * Per-attempt timeout for the PRIMARY perception call. MiniMax M3 vision with the full
 * structuring prompt is empirically 10-50s (and slower on multi-page / under load), so
 * 30s was too tight and aborted valid-but-slow responses -> spurious 502s. 65s lets a
 * genuine response land; the fallback (below) uses a shorter budget so the total stays
 * bounded under the client timeout.
 */
export const DEFAULT_TIMEOUT_MS = 65_000;
/** Shorter budget for the ONE fallback attempt, so primary+fallback stay < the client timeout. */
export const FALLBACK_TIMEOUT_MS = 25_000;

/** Thrown when both the primary and the fallback model attempts fail. */
export class PerceptionError extends Error {
  override readonly name = 'PerceptionError';
  /** The error from the final (fallback) attempt, kept for diagnostics. */
  override readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.cause = options?.cause;
  }
}

/**
 * The shape of an OpenRouter / OpenAI-compatible chat-completions response that
 * we depend on. Parsed defensively (never trusting `any`); only the assistant
 * message text is consumed.
 */
interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

/**
 * Perceive a menu from a cleaned image data URL.
 *
 * POSTs the image + static prompt to the AI Gateway chat-completions endpoint
 * (OpenRouter-compatible). On any failure of the primary model — network error,
 * timeout/abort, non-2xx response, missing content, malformed JSON, or schema
 * validation failure — it retries EXACTLY ONCE with `env.PERCEPTION_MODEL_FALLBACK`.
 *
 * @param imageDataUrls one or more `data:` URLs of the CLEANED menu photos (EXIF/GPS
 *        stripped, no faces) — the app guarantees this before upload. Multiple pages
 *        are sent as multiple image blocks in ONE call. Accepts a single string for
 *        back-compat.
 * @param env Worker bindings (model slugs, gateway URL, API key).
 * @param opts optional locale / timeout / injected fetch.
 * @throws {PerceptionError} when both the primary and fallback attempts fail.
 */
export async function perceiveMenu(
  imageDataUrls: string | readonly string[],
  env: Env,
  opts: PerceiveOptions = {},
): Promise<PerceivedMenu> {
  const locale = opts.locale ?? 'en';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);

  // Build the messages ONCE: the static prompt + the image(s), nothing else.
  const messages = buildPerceptionMessages(imageDataUrls, locale);

  try {
    return await attempt(env.PERCEPTION_MODEL, messages, env, fetchImpl, timeoutMs);
  } catch (primaryError) {
    // Retry ONCE with the fallback model. Any failure class is retryable here:
    // a flaky network, a slow model, or a model that returned unparseable JSON.
    try {
      return await attempt(env.PERCEPTION_MODEL_FALLBACK, messages, env, fetchImpl, Math.min(timeoutMs, FALLBACK_TIMEOUT_MS));
    } catch (fallbackError) {
      throw new PerceptionError(
        `Perception failed on both '${env.PERCEPTION_MODEL}' and '${env.PERCEPTION_MODEL_FALLBACK}'.`,
        { cause: fallbackError },
      );
    }
  }
}

/**
 * A single model attempt: build the anonymous body, POST it, extract + clean the
 * assistant content, parse JSON, and validate against the schema. Throws on any
 * failure so the caller can decide whether to fall back.
 */
async function attempt(
  model: string,
  messages: ReturnType<typeof buildPerceptionMessages>,
  env: Env,
  fetchImpl: FetchImpl,
  timeoutMs: number,
): Promise<PerceivedMenu> {
  // ANONYMITY-CRITICAL: this object is the ENTIRE request payload. It contains
  // only the model slug, the static prompt messages, and tuning params. Do not
  // add anything derived from user identity/health/location/free-text here.
  const body = {
    model,
    messages,
    temperature: 0,
    response_format: { type: 'json_object' as const },
    // COST: opt into WaveSpeed's prompt cache so the large, byte-stable system prompt
    // (the leading message — see buildPerceptionMessages) is billed once and reused as a
    // cached prefix across scans; only the variable image+instruction tail is charged.
    // OpenAI-compatible providers that don't recognise this key ignore it (no behaviour
    // change on the legacy OpenRouter fail-over path), so it is safe to always send.
    prompt_cache: true,
  };

  // Resolve the provider endpoint + key. Default: WaveSpeed (MiniMax M3) via its
  // OpenAI-compatible base URL + the single WAVESPEED_API_KEY. Falls back to the
  // legacy OpenRouter AI-Gateway + OPENROUTER_API_KEY when the WaveSpeed vars are
  // unset (keeps existing deployments / tests working unchanged).
  const baseUrl = env.PERCEPTION_BASE_URL ?? env.AI_GATEWAY_BASE_URL;
  const apiKey = env.WAVESPEED_API_KEY ?? env.OPENROUTER_API_KEY ?? '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let raw: string;
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`AI Gateway returned HTTP ${res.status} for model '${model}'.`);
    }

    raw = await res.text();
  } finally {
    clearTimeout(timer);
  }

  const completion = JSON.parse(raw) as ChatCompletionResponse;
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error(`Model '${model}' returned no assistant content.`);
  }

  const json: unknown = JSON.parse(stripCodeFences(content));
  // Trust boundary: validate the model's JSON before the engine sees it.
  return perceivedMenuSchema.parse(json);
}

/**
 * Strip a single surrounding Markdown code fence (```json ... ``` or ``` ... ```)
 * from a model response. The prompt asks for raw JSON, but models sometimes wrap
 * it anyway; we tolerate that without trusting the rest.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;

  // Drop the opening fence line (``` optionally followed by a language tag)…
  const withoutOpen = trimmed.replace(/^```[^\n]*\n?/, '');
  // …and the closing fence at the very end.
  return withoutOpen.replace(/\n?```$/, '').trim();
}

/** True when the perceived menu has no dishes (e.g. the image was not a menu). */
export function isMenuEmpty(menu: PerceivedMenu): boolean {
  return menu.dishes.length === 0;
}

/**
 * True when the image very likely is NOT a readable menu, so the app should show an
 * honest "try again" state rather than any dishes. Triggers on EITHER an explicit
 * `isMenu === false`, OR a self-reported `menuConfidence` below {@link MIN_MENU_CONFIDENCE}.
 *
 * The signal is ADVISORY and conservative: a present-but-decent confidence never
 * overrides real dishes (this returns false whenever the model still produced dishes
 * unless it explicitly said it is not a menu), and an ABSENT signal (legacy/cached
 * perceptions) is never treated as a rejection on its own — those fall back to the
 * dishes-length check at the route. We never fabricate dishes either way.
 */
export function isLowMenuConfidence(menu: PerceivedMenu): boolean {
  if (menu.isMenu === false) return true;
  if (menu.dishes.length > 0) return false;
  return typeof menu.menuConfidence === 'number' && menu.menuConfidence < MIN_MENU_CONFIDENCE;
}
