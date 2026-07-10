/**
 * CORS — browser-abuse hardening, NOT authentication.
 *
 * The native app (apps/mobile) uses a plain `fetch` that is NOT CORS-bound, so this
 * middleware does nothing for it; it only constrains real browsers. Per docs/SECURITY.md
 * and the deployment runbook the default wide-open `cors()` (which reflects ANY
 * Origin) is replaced with an explicit, env-driven allow-list:
 *
 *  - The allow-list comes from `CORS_ALLOWED_ORIGINS` (comma-separated, trimmed). When
 *    it is empty (the default, and the case in tests/CI) NO browser Origin is allowed —
 *    we never reflect an arbitrary Origin.
 *  - We never combine a wildcard or a reflected Origin with credentials: the app sends
 *    no cookies, so `Access-Control-Allow-Credentials` is never set (credentialed-
 *    wildcard footgun avoided, SECURITY.md).
 *  - Allowed methods/headers cover exactly what the API uses: GET, POST, DELETE,
 *    OPTIONS and the `X-Device-Id` / `Content-Type` / `Accept` headers.
 */
import { cors } from 'hono/cors';
import type { Context, MiddlewareHandler } from 'hono';

import type { Env } from './env';

/** Methods the API exposes across /scan, /image, /menus (+ preflight OPTIONS). */
const ALLOWED_METHODS = ['GET', 'POST', 'DELETE', 'OPTIONS'];

/** Request headers a browser client may send: JSON content + the opaque device id. */
const ALLOWED_HEADERS = ['Content-Type', 'X-Device-Id', 'Accept'];

/**
 * Parse the comma-separated `CORS_ALLOWED_ORIGINS` var into a de-duplicated set of
 * trimmed, non-empty origins. Pure + total: `undefined`/empty/whitespace -> empty set
 * (a closed allow-list that reflects nothing). Exported for direct unit testing.
 */
export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0),
  );
}

/**
 * Build the CORS middleware for this Worker, keyed on the env allow-list.
 *
 * The `origin` callback echoes the request Origin ONLY when it is in the allow-list
 * (so `Access-Control-Allow-Origin` is that exact Origin, never `*`), and returns
 * `null` otherwise so Hono emits no `Access-Control-Allow-Origin` header at all for a
 * disallowed/absent Origin. Credentials stay OFF (no cookies in this API).
 */
export function corsAllowlist(): MiddlewareHandler<{ Bindings: Env }> {
  return cors({
    origin: (origin, c: Context<{ Bindings: Env }>) => {
      const allowed = parseAllowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
      return allowed.has(origin) ? origin : null;
    },
    allowMethods: ALLOWED_METHODS,
    allowHeaders: ALLOWED_HEADERS,
    // No credentials: the native app has no cookies, and a reflected-origin + creds
    // pairing would be a real vulnerability (SECURITY.md). Leave it unset (false).
  });
}
