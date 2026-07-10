import { Hono } from 'hono';
import type { Env } from './env';
import { corsAllowlist } from './cors';
import { scanRoute } from './routes/scan';
import { imageRoute } from './routes/image';
import { menusRoute } from './routes/menus';

/**
 * Bocado API (Cloudflare Worker). Thin edge over the deterministic engine + the
 * anonymous perception call. Holds NO user health data; allergy-aware suitability
 * is finalized on-device by the app.
 */
const app = new Hono<{ Bindings: Env }>();

// Browser-abuse hardening only (the native app's fetch is not CORS-bound). Closed by
// default: no Origin is reflected unless it is in the CORS_ALLOWED_ORIGINS allow-list.
app.use('*', corsAllowlist());

app.get('/health', (c) => c.json({ ok: true, environment: c.env.ENVIRONMENT }));

// POST /scan  — image -> perceived menu -> nutrition + allergens -> ScannedMenu (anonymous)
app.route('/scan', scanRoute);

// GET/POST /image — lazy dish illustration, cached in R2 by normalized name
app.route('/image', imageRoute);

// /menus — anonymous save + recall of scanned menus under an opaque device id
app.route('/menus', menusRoute);

export default app;
