/**
 * Worker bindings + config. The Hono app is typed `Hono<{ Bindings: Env }>`.
 *
 * Privacy invariant (ARCHITECTURE.md / SECURITY.md): the perception call sends
 * ONLY the cleaned menu image + a static prompt to the model. No user id, no
 * allergies, no location ever reach OPENROUTER. Allergy-aware suitability is
 * computed on-device by the app from the anonymous nutrition + allergen flags
 * this Worker returns.
 */
export interface Env {
  // --- Secrets (wrangler secret put ... / local .dev.vars) — never in code/config ---
  /**
   * SINGLE provider key for the WaveSpeedAI plane. Used for BOTH the perception LLM
   * (MiniMax M3 via the OpenAI-compatible endpoint llm.wavespeed.ai/v1) AND dish-image
   * generation. Set locally in apps/api/.dev.vars, in prod via
   * `wrangler secret put WAVESPEED_API_KEY`. This is the one key you paste to go live.
   */
  WAVESPEED_API_KEY?: string;
  /**
   * Legacy/alternative perception key (OpenRouter via AI Gateway). OPTIONAL: only used
   * when WAVESPEED_API_KEY is unset and PERCEPTION_BASE_URL points at an OpenRouter
   * gateway. Kept as a fail-over path; not needed for the default WaveSpeed setup.
   */
  OPENROUTER_API_KEY?: string;
  /**
   * Vertex AI OAuth2 access token for the Imagen image provider. OPTIONAL: when
   * unset (e.g. local `wrangler dev` or tests) the image route automatically falls
   * back to the on-platform Workers-AI FLUX provider — no key is ever required to
   * run locally. In production this is set from a short-lived service-account token
   * via `wrangler secret put VERTEX_ACCESS_TOKEN` (refreshed out of band).
   */
  VERTEX_ACCESS_TOKEN?: string;
  /**
   * USDA FoodData Central API key for the RUNTIME long-tail nutrition fallback
   * (apps/api/src/nutrition/usdaFallback.ts). OPTIONAL + FEATURE-GATED: when unset (CI,
   * local `wrangler dev`, tests) the fallback is skipped entirely and an unresolved
   * ingredient stays honestly unmatched (wider range, lower confidence) — the system
   * degrades safely and never depends on the network. Free key at fdc.nal.usda.gov;
   * set in prod via `wrangler secret put FDC_API_KEY`. The lookup sends a GENERIC food
   * name only (two-planes anonymity), never user identity/allergy/location.
   */
  FDC_API_KEY?: string;

  // --- Vars (wrangler.jsonc) ---
  ENVIRONMENT: 'development' | 'preview' | 'production';
  /**
   * Browser CORS allow-list: a comma-separated list of exact origins permitted to call
   * this API from a browser (e.g. 'https://app.bocado.example,https://bocado.example').
   * OPTIONAL + closed-by-default: when unset/empty (local `wrangler dev`, tests, CI) NO
   * browser Origin is reflected — the native app's fetch is not CORS-bound so it is
   * unaffected. CORS here is browser-abuse hardening, never auth (SECURITY.md).
   */
  CORS_ALLOWED_ORIGINS?: string;
  /**
   * Per-window (hourly) cap for POST /scan, keyed on the opaque X-Device-Id. OPTIONAL +
   * FAIL-OPEN: when unset/0/invalid the limiter is disabled and every request passes.
   * A finite positive integer enables a fixed-window cost floor (NOT abuse prevention —
   * the device id is rotatable; the Cloudflare WAF is the real backstop).
   */
  SCAN_RATE_LIMIT?: string;
  /**
   * Per-window (hourly) cap for GET /image, keyed on the HASHED client IP (the image
   * plane is keyless; the raw IP is never stored). OPTIONAL + FAIL-OPEN, same semantics
   * as SCAN_RATE_LIMIT.
   */
  IMAGE_RATE_LIMIT?: string;
  /**
   * Per-window (hourly) cap for POST /menus, keyed on the mandatory X-Device-Id. Bounds
   * unauthenticated D1 writes. OPTIONAL + FAIL-OPEN, same semantics as SCAN_RATE_LIMIT.
   */
  MENUS_RATE_LIMIT?: string;
  /**
   * Base URL for the perception LLM (OpenAI-compatible /chat/completions). Defaults
   * to WaveSpeed ('https://llm.wavespeed.ai/v1'); the client falls back to
   * AI_GATEWAY_BASE_URL when this is unset (legacy OpenRouter path).
   */
  PERCEPTION_BASE_URL?: string;
  /** Cloudflare AI Gateway endpoint fronting OpenRouter (legacy/fail-over perception path). */
  AI_GATEWAY_BASE_URL: string;
  /** Perception model slug, e.g. 'minimax/minimax-m3' (WaveSpeed) — vision + JSON output. */
  PERCEPTION_MODEL: string;
  /** Fallback perception model, e.g. 'minimax/minimax-01' (also on WaveSpeed). */
  PERCEPTION_MODEL_FALLBACK: string;

  /**
   * Preferred dish-image provider: 'wavespeed' (WaveSpeedAI), 'imagen' (Vertex AI
   * Imagen 4 Fast), or 'flux' (on-platform Workers-AI). Whatever the value, the route
   * falls back through the configured providers to FLUX whenever the preferred one is
   * not configured/usable, so it always works under local `wrangler dev` with no keys.
   */
  IMAGE_PROVIDER?: 'wavespeed' | 'imagen' | 'flux';
  /**
   * WaveSpeed model id (path after /api/v3/), e.g. 'wavespeed-ai/flux-2-flash/text-to-image'.
   * Required for the WaveSpeed provider; defaults to fast FLUX schnell if unset.
   */
  WAVESPEED_MODEL?: string;
  /**
   * Output size for the WaveSpeed image model (e.g. '768*768'). Smaller = faster +
   * lighter + cheaper (Flux 2 cost scales with output size). When set, the provider
   * also requests `enable_sync_mode` so the result returns inline (no extra polling).
   * App displays at ~hero/thumbnail scale, so a mid resolution is plenty. Unset =
   * the model's (heavier) default.
   */
  WAVESPEED_IMAGE_SIZE?: string;
  /** GCP project id for Vertex AI Imagen calls. Required for the Imagen provider. */
  VERTEX_PROJECT_ID?: string;
  /** Vertex AI EU region for Imagen calls (e.g. 'europe-west4') — keeps gen in-region. */
  VERTEX_LOCATION?: string;

  // --- Bindings ---
  /** Workers AI — FLUX.1 [schnell] dish-image generation (fallback provider). */
  AI: Ai;
  /** R2 (EU jurisdiction) — menu/generated images, cached by normalized dish name. */
  IMAGES: R2Bucket;
  /** D1 (EU jurisdiction) — cached perceptions / saved menus. */
  DB: D1Database;
}
