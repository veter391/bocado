/**
 * API endpoint config. Set EXPO_PUBLIC_API_BASE_URL (e.g. the deployed Worker URL,
 * or http://localhost:8787 for `wrangler dev`) to talk to the real backend.
 * When unset, the app runs in MOCK mode (sample menu) so the UI is fully usable
 * with no keys/server — useful before the backend is wired to real credentials.
 */
const RAW = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const API_BASE_URL = RAW && RAW.length > 0 ? RAW.replace(/\/$/, '') : null;

/** True when a real backend is configured; false => MOCK mode. */
export const API_CONFIGURED = API_BASE_URL !== null;

/**
 * Default request timeout for API calls (ms). Must exceed the Worker's worst-case
 * perception time (primary 65s + fallback 25s ≈ 90s) so the client doesn't abort a
 * scan the server is still legitimately working on. The on-screen "analyzing" state
 * covers the wait; a real menu typically resolves far sooner.
 */
export const API_TIMEOUT_MS = 95_000;
