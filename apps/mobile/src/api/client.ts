/**
 * Bocado API client — the device's ONLY direct link to the backend Worker.
 *
 * Two endpoints, both ANONYMOUS by contract (ARCHITECTURE.md §0–1, SECURITY.md §1):
 *   - POST /scan   : { image, locale?, context? } -> ScannedMenu
 *   - GET  /image  : ?name=<dish name>            -> a PNG (URL builder only here)
 *
 * PRIVACY INVARIANT (SECURITY.md §1): this client sends ONLY the cleaned image plus
 * a UI locale and a meal context. The user's profile / allergies / goals / location
 * are NEVER attached to a request here — they belong to the on-device personalization
 * plane. Allergy-aware suitability is finalized on-device (see data/menuService.ts),
 * NOT by appending profile data to this call. There is deliberately no parameter on
 * `scanMenu` through which profile data could be smuggled to the server.
 *
 * MOCK mode: when `API_BASE_URL` is null these functions throw / no-op rather than
 * hitting a nonexistent server. Callers must check `API_CONFIGURED` first (the data
 * layer does) and use the sample menu instead.
 */
import type { MealContext, ScannedMenu } from '@bocado/shared';

import { API_BASE_URL, API_TIMEOUT_MS } from './config';

/** Thrown for any scan failure (no backend, timeout, non-2xx, or a malformed body). */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  /** HTTP status when the failure was an HTTP response; undefined for transport/abort. */
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

/**
 * A compact, list-friendly view of a saved menu (history rows). The full
 * {@link ScannedMenu} is fetched on demand via {@link getSavedMenu}.
 */
export interface MenuSummary {
  id: string;
  createdAt: string;
  title?: string;
  context: MealContext;
  dishCount: number;
}

/** Options for {@link scanMenu}. Note: NO `profile` field — see the privacy invariant. */
export interface ScanOptions {
  /** UI display locale (e.g. 'en', 'es') for translatedName/explanation. NOT personal data. */
  locale?: string;
  /** Meal context (time-of-day class). Optional; the server derives one if omitted. */
  context?: MealContext;
}

/** The wire body POSTed to /scan. Exactly these keys — the server rejects anything else. */
interface ScanRequestBody {
  /** Single-page back-compat field. Present only when exactly one page is scanned. */
  image?: string;
  /** Multi-page capture: several cleaned page photos of ONE menu, read in one call. */
  images?: string[];
  locale?: string;
  context?: MealContext;
}

/**
 * Result of a {@link scanMenu} call: the structured menu PLUS the edge's honest
 * "is this a menu?" signal. `notMenu` is true when the photo clearly isn't a readable
 * menu (the model returned no dishes and flagged low confidence) — the UI shows a
 * "try again" state instead of an empty menu. `hint` is a friendly UI message that may
 * accompany an empty/non-menu result. The menu is always a valid (possibly empty) shape.
 */
export interface ScanResult {
  menu: ScannedMenu;
  notMenu: boolean;
  hint?: string;
}

/** Minimal structural guard: confirm the parsed JSON is a usable ScannedMenu. */
function isScannedMenu(value: unknown): value is ScannedMenu {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.context === 'string' &&
    Array.isArray(v.dishes)
  );
}

/**
 * Scan one or more cleaned menu page images and return the structured, anonymous
 * {@link ScanResult} (the menu plus the edge's "is this a menu?" signal).
 *
 * @param imageDataUrls one or more `data:` URLs of the EXIF/GPS-stripped, face-checked
 *                      menu photos (cleaning happens upstream on-device — see ScanScreen).
 *                      Several pages of one menu are sent as `images[]` in a SINGLE call;
 *                      a lone string is sent as the back-compat single `image` field.
 * @param opts          locale + meal context only. No profile (privacy invariant).
 *
 * Aborts after {@link API_TIMEOUT_MS}. Throws {@link ApiError} when the backend is
 * not configured, the request times out, the response is non-ok, or the body is not
 * a well-formed menu. The returned menu's per-dish `suitability` is TIME-BASED only;
 * the data layer re-runs the on-device profile-aware pass before storing.
 */
export async function scanMenu(
  imageDataUrls: string | readonly string[],
  opts?: ScanOptions,
): Promise<ScanResult> {
  if (API_BASE_URL === null) {
    // MOCK mode: callers must branch on API_CONFIGURED before reaching here.
    throw new ApiError('No backend configured (running in mock mode).');
  }

  const pages = typeof imageDataUrls === 'string' ? [imageDataUrls] : Array.from(imageDataUrls);
  if (pages.length === 0) {
    throw new ApiError('scanMenu requires at least one image.');
  }

  // Single page -> back-compat `image`; multiple -> `images[]` (one amortized call).
  const body: ScanRequestBody =
    pages.length === 1 ? { image: pages[0]! } : { images: pages };
  if (opts?.locale !== undefined) body.locale = opts.locale;
  if (opts?.context !== undefined) body.context = opts.context;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': APP_USER_AGENT },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'The scan timed out. Please check your connection and try again.'
        : 'Could not reach the server. Please try again.',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(`Scan failed (HTTP ${response.status}).`, { status: response.status });
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (cause) {
    throw new ApiError('The server returned an unreadable response.', { cause });
  }

  if (!isScannedMenu(parsed)) {
    throw new ApiError('The server returned a menu in an unexpected shape.');
  }

  // Read the optional edge signals off the (validated) envelope without trusting them
  // for the menu shape: `notMenu` flags a clear non-menu photo, `hint` is friendly copy.
  const envelope = parsed as ScannedMenu & { notMenu?: unknown; hint?: unknown };
  return {
    menu: parsed,
    notMenu: envelope.notMenu === true,
    hint: typeof envelope.hint === 'string' ? envelope.hint : undefined,
  };
}

/**
 * Build the URL for a dish's lazy AI illustration (GET /image?name=...).
 *
 * The image plane is anonymous: the ONLY input is the dish name. The Worker marks
 * every generated image AI-generated (X-AI-Generated header + R2 metadata) and the
 * app shows the visible "AI illustration" badge (SECURITY.md §2.C).
 *
 * @throws {ApiError} when no backend is configured (mock mode has no image server).
 */
export function dishImageUrl(name: string): string {
  if (API_BASE_URL === null) {
    throw new ApiError('No backend configured (running in mock mode).');
  }
  return `${API_BASE_URL}/image?name=${encodeURIComponent(name)}`;
}

// ---------------------------------------------------------------------------
// Saved menus (history) — anonymous, device-scoped.
//
// The `/menus` endpoint stores a device's recently-scanned menus, scoped by the
// opaque `X-Device-Id` header (see data/deviceId.ts). It carries NO profile / allergy
// / account data — same anonymity contract as /scan. When no backend is configured the
// data layer keeps history on-device instead (see data/menuService.ts); these client
// functions throw in mock mode so callers branch on API_CONFIGURED first.
// ---------------------------------------------------------------------------

const DEVICE_ID_HEADER = 'X-Device-Id';

/**
 * A stable, identifying User-Agent for the app's requests. Cloudflare's bot protection
 * (error 1010) blocks generic/library user-agents (curl, python-urllib, sometimes raw
 * okhttp); a named app UA passes cleanly. Carries NO user data.
 */
const APP_USER_AGENT = 'Bocado/0.1 (mobile; Expo)';

/** Shared request runner for the JSON `/menus` calls: timeout, abort, error mapping. */
async function requestJson(
  path: string,
  init: RequestInit & { deviceId: string },
): Promise<unknown> {
  if (API_BASE_URL === null) {
    throw new ApiError('No backend configured (running in mock mode).');
  }
  const { deviceId, headers, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: { Accept: 'application/json', 'User-Agent': APP_USER_AGENT, [DEVICE_ID_HEADER]: deviceId, ...headers },
      signal: controller.signal,
    });
  } catch (cause) {
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    throw new ApiError(
      aborted ? 'The request timed out. Please try again.' : 'Could not reach the server.',
      { cause },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new ApiError(`Request failed (HTTP ${response.status}).`, { status: response.status });
  }

  // An empty 2xx body is a valid success — a `DELETE` returns `204 No Content` (or an
  // empty 200), and calling `.json()` on it would otherwise throw "unreadable response".
  // Detect this from a 204 status or a Content-Length of 0 and resolve with `null` so
  // body-less endpoints (the GDPR deletes) don't need a JSON envelope.
  if (response.status === 204) return null;
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength === '0') return null;

  try {
    return await response.json();
  } catch (cause) {
    throw new ApiError('The server returned an unreadable response.', { cause });
  }
}

/** Structural guard for a {@link MenuSummary} from the wire. */
function isMenuSummary(value: unknown): value is MenuSummary {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.createdAt === 'string' &&
    typeof v.context === 'string' &&
    typeof v.dishCount === 'number'
  );
}

/**
 * Persist a scanned menu to the device's server-side history.
 *
 * The menu is ALREADY anonymous (no profile data is ever attached to a Dish), so this
 * stores exactly what the Results screen reads. Scoped to this device via the header.
 *
 * @throws {ApiError} in mock mode, on timeout, or on a non-2xx response.
 */
export async function saveMenu(menu: ScannedMenu, deviceId: string): Promise<void> {
  await requestJson('/menus', {
    deviceId,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ menu }),
  });
}

/**
 * List this device's recently-scanned menus, newest first (server orders; we also
 * defensively re-sort). Returns compact summaries; fetch the full menu via
 * {@link getSavedMenu}.
 *
 * @throws {ApiError} in mock mode, on timeout, or on a malformed response.
 */
export async function listMenus(deviceId: string): Promise<MenuSummary[]> {
  const parsed = await requestJson('/menus', { deviceId, method: 'GET' });
  const arr = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { menus?: unknown }).menus)
      ? (parsed as { menus: unknown[] }).menus
      : null;
  if (arr === null) {
    throw new ApiError('The server returned history in an unexpected shape.');
  }
  return arr
    .filter(isMenuSummary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Fetch one full saved menu by id from the device's history.
 *
 * @throws {ApiError} in mock mode, on timeout, or when the body is not a valid menu.
 */
export async function getMenu(id: string, deviceId: string): Promise<ScannedMenu> {
  const parsed = await requestJson(`/menus/${encodeURIComponent(id)}`, {
    deviceId,
    method: 'GET',
  });
  if (!isScannedMenu(parsed)) {
    throw new ApiError('The server returned a menu in an unexpected shape.');
  }
  return parsed;
}

/**
 * Delete one saved menu from the device's server-side history (GDPR Art. 17).
 *
 * Device-scoped + anonymous: like every `/menus` call this carries ONLY the
 * `X-Device-Id` header — no profile / allergy / account data. The Worker scopes the
 * delete by `id AND device_id` and responds idempotently (it neither errors on a
 * double-delete nor reveals whether another device owns the id), so the caller treats
 * any 2xx — including a body-less `204` — as success.
 *
 * @throws {ApiError} in mock mode, on timeout, or on a non-2xx response.
 */
export async function deleteMenu(id: string, deviceId: string): Promise<void> {
  await requestJson(`/menus/${encodeURIComponent(id)}`, { deviceId, method: 'DELETE' });
}

/**
 * Delete ALL of this device's saved menus from server-side history (GDPR Art. 17 —
 * "clear scan history"). Device-scoped + anonymous, same contract as {@link deleteMenu}.
 *
 * @throws {ApiError} in mock mode, on timeout, or on a non-2xx response.
 */
export async function deleteAllMenus(deviceId: string): Promise<void> {
  await requestJson('/menus', { deviceId, method: 'DELETE' });
}
