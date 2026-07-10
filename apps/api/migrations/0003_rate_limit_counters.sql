-- Bocado API — fixed-window rate-limit counters (EU jurisdiction).
--
-- Apply locally:   wrangler d1 migrations apply bocado --local
-- Apply remote:    wrangler d1 migrations apply bocado --remote
--
-- PURPOSE: a COST FLOOR for the billed model paths (/scan, /image), NOT abuse
-- prevention. It bounds how often a single key can hit those endpoints in a one-hour
-- window so a runaway client cannot rack up spend. The real abuse backstop is the
-- owner-configured Cloudflare WAF / IP rule (see the deployment runbook) — the key
-- here (opaque device id, or a HASHED IP for the keyless /image) is rotatable.
--
-- ANONYMITY / NO-PII INVARIANT (SECURITY.md §1): `key` is an OPAQUE counter key only —
-- either the client-provided opaque device id (NOT identity) or a one-way SHA-256 hash
-- of the client IP (the raw IP, GDPR personal data, is NEVER stored here). No bodies,
-- no identity, nothing is logged. `window_start` floors to the top of the hour, so a
-- counter is naturally transient: once the window rolls over the row is overwritten and
-- no durable per-user history accumulates. The limiter fails OPEN — when this table is
-- absent or a write errors, requests still pass (see src/rateLimit.ts).

CREATE TABLE IF NOT EXISTS rate_limit_counters (
  key           TEXT PRIMARY KEY,            -- opaque key: 'scan:<deviceId>' or 'image:<sha256(ip)>'
  window_start  INTEGER NOT NULL,            -- epoch-ms floored to the hour (the fixed window anchor)
  count         INTEGER NOT NULL             -- requests recorded in the current window
);
