/**
 * Per-device / per-IP rate limiting — a COST FLOOR, not real abuse prevention.
 *
 * This is a fixed-window counter persisted in D1 (`rate_limit_counters`). It bounds
 * how often the billed model paths (/scan, /image) can be hit from a single key in a
 * one-hour window, so a runaway client or trivial script cannot rack up spend. It is
 * NOT a security boundary: the key is the opaque `X-Device-Id` (rotatable) for /scan
 * and the transient client IP for the keyless /image, both of which an attacker can
 * change. The real backstop is the owner-configured Cloudflare WAF / IP rule
 * (see the deployment runbook) — this limiter only stops accidental/cheap overuse.
 *
 * Privacy (SECURITY.md §1):
 *  - We store ONLY an opaque counter key + a window start + a count, with a short TTL
 *    anchor (`window_start`). No identity, no bodies, nothing is logged. The IP used
 *    for /image is hashed by the caller before it ever reaches here (and the row is
 *    transient — a fresh window discards the old count).
 *
 * Fail-OPEN (SECURITY.md, mirrors the best-effort perception-cache write in scan.ts):
 *  - Any D1 error/timeout, or an absent/zero limit, ALLOWS the request. The limiter
 *    must never turn a counter-store hiccup into a 500 or a self-DoS.
 *
 * Determinism: the window math is pure (see {@link windowStart}); the only impurity
 * is the D1 read/modify/write, which lives in {@link enforceRateLimit}.
 */
import type { Env } from './env';

/** Fixed window length: one hour, in milliseconds. */
export const WINDOW_MS = 60 * 60 * 1000;

/**
 * One-way (hex SHA-256) hash of a rate-limit key input. Used to hash the client IP
 * for the keyless /image plane BEFORE it is used as a counter key, so a raw IP (GDPR
 * personal data, SECURITY.md §1) is never stored. Deterministic: identical input ->
 * identical key, so the same IP keeps hitting the same counter within a window.
 */
export async function hashKey(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Outcome of a limit check (pure decision; no I/O). */
export interface RateLimitDecision {
  /** Whether the request is allowed under the cap. */
  allowed: boolean;
  /** Seconds until the current window resets — only meaningful when `allowed` is false. */
  retryAfter: number;
}

/**
 * Floor a timestamp to the start of its fixed window (the top of the hour). Pure +
 * deterministic, so the same instant always maps to the same window key.
 */
export function windowStart(nowMs: number): number {
  return Math.floor(nowMs / WINDOW_MS) * WINDOW_MS;
}

/**
 * Parse a per-window limit from an env var. Pure + total: a missing, non-numeric,
 * non-integer, zero, or negative value yields `null`, which the caller treats as
 * "limiter disabled" (fail-open). Only a finite positive integer enables the cap.
 */
export function parseLimit(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Pure decision: given the current count already recorded in this window and the cap,
 * decide whether the incoming (count+1-th) request is allowed.
 *
 * `priorCount` is how many requests this key already made in the current window. The
 * request under consideration is allowed iff it would not exceed `limit`
 * (i.e. priorCount < limit). When denied, `retryAfter` is the whole seconds left until
 * the window rolls over.
 */
export function checkRateLimit(
  priorCount: number,
  limit: number,
  nowMs: number,
): RateLimitDecision {
  if (priorCount < limit) {
    return { allowed: true, retryAfter: 0 };
  }
  const nextWindow = windowStart(nowMs) + WINDOW_MS;
  const retryAfter = Math.max(1, Math.ceil((nextWindow - nowMs) / 1000));
  return { allowed: false, retryAfter };
}

/**
 * Enforce the limit for an opaque `key` (device id or hashed IP) using D1 as the
 * counter store. Reads the current window's count, decides via {@link checkRateLimit},
 * and — when allowed — increments the persisted count (upserting a fresh row when the
 * window has rolled over). Returns the decision.
 *
 * FAIL-OPEN: when no `DB` binding is present, no `limit` is configured, or any D1 call
 * throws, the request is ALLOWED. No identity/IP/body is ever logged here.
 */
export async function enforceRateLimit(
  env: Env,
  key: string,
  limit: number | null,
  nowMs: number,
): Promise<RateLimitDecision> {
  // Disabled (no cap) or no store -> allow. Same feature-gate spirit as FDC_API_KEY.
  if (limit === null || !env.DB) {
    return { allowed: true, retryAfter: 0 };
  }

  const start = windowStart(nowMs);

  try {
    // ATOMIC increment-and-read in ONE statement. A separate SELECT-then-write let two
    // concurrent requests in the same window both read the same prior count and both
    // write count+1, so a burst could exceed the cap. A single INSERT ... ON CONFLICT DO
    // UPDATE ... RETURNING cannot interleave that way (D1/SQLite serializes the write),
    // so the returned `count` reflects every prior request. On a window rollover the CASE
    // resets the count to 1, so old windows never accumulate.
    const row = await env.DB.prepare(
      `INSERT INTO rate_limit_counters (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
      .bind(key, start)
      .first<{ count: number }>();

    // `count` is this request's 1-based position in the window; checkRateLimit takes the
    // PRIOR count (count - 1) and applies the same cap decision used everywhere else.
    return checkRateLimit((row?.count ?? 1) - 1, limit, nowMs);
  } catch {
    // Fail-open: a counter-store error must never break the billed path. No logging.
    return { allowed: true, retryAfter: 0 };
  }
}
