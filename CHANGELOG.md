# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] — 2026-07-11

### Added
- **End-to-end journey test** over the composed Worker (`app`): health → scan (perception
  mocked) → save the exact `/scan` output → list history → open by id → per-device
  isolation (404 for another device) → delete → gone. Fully runnable in CI (in-memory D1,
  no network), plus a non-menu case that must never fabricate dishes.

### Fixed
- **Saving a scanned menu still failed (second contract drift).** `POST /menus` also
  rejected the nutrition object's honesty fields — the engine stores an `EstimateResult`
  (`unmatchedCount` / `uncertain` / `uncertaintyReason`) while `Dish.nutrition` is typed
  as the narrower `NutritionEstimate`, so the `.strict()` menus schema 400'd every real
  scan. The new E2E test surfaced it; the schema now accepts these fields (optional, so a
  minimal/legacy stored menu still round-trips). This is the same class as the 0.1.2
  ingredient-shape fix — the E2E now guards the whole `/scan → /menus` seam.

[0.1.4]: https://github.com/veter391/bocado/releases/tag/v0.1.4

## [0.1.3] — 2026-07-11

Second review round — hardening the public API surface. Verified, additive changes
only; riskier findings were deliberately deferred rather than risk a regression.

### Added
- `POST /menus` now enforces a per-device hourly rate limit (`MENUS_RATE_LIMIT`,
  default 120) — the menus plane was otherwise unbounded anonymous D1 writes.

### Changed
- `/scan` rejects non-image payloads up front: a data URL must be a PNG/JPEG/WebP image,
  so a non-image blob can't be forwarded to (and billed by) the perception model.
- USDA long-tail nutrition lookups in `/scan` now run with bounded concurrency (batches
  of 6) instead of one-at-a-time, cutting worst-case wall-clock on large multi-page menus;
  each lookup degrades to null on failure so a batch can never fail the scan.

### Deferred (documented, not done — reward did not justify regression risk)
- Atomicity of the fixed-window rate-limit counter (read-then-write can let a concurrent
  burst slightly exceed the cap): it is a documented cost floor, not a security boundary,
  and the atomic-UPDATE fix touches the limiter every route depends on.
- Per-device ownership guard on the menu upsert: menu ids are random UUIDs, so a
  cross-device collision is not practically reachable.
- Persist-debounce refactor in the profile / saved-dishes stores (extra keystore writes
  on rapid edits): current behaviour is eventually-correct with no data loss, and the
  refactor touches a persistence path.

[0.1.3]: https://github.com/veter391/bocado/releases/tag/v0.1.3

## [0.1.2] — 2026-07-11

Fixes from a grounded two-agent code review (each finding verified against the code
before changing anything).

### Fixed
- **Diet correctness (gluten-free / vegan false-negatives).** `GLUTEN_WORDS` is now kept
  in lock-step with the allergen `gluten` pattern list, so curated/canonical wheat foods
  the model emits verbatim (croissant, oats, cracker, biscuit, cake, bulgur, pâtes,
  noodle) are no longer given a silent gluten-free pass. `flan` / `custard` (curated
  egg+milk desserts) now count as animal products, so a vegan filter no longer passes
  them.
- **Saving a scanned menu was broken.** `POST /menus` validated dish ingredients as the
  legacy `{name, grams}` shape, which rejected the real `IngredientGuess` shape that
  `/scan` produces (canonicalName / basis / isAddedFat, `name` often absent) with a 400.
  It now reuses the shared `ingredientGuessSchema` and round-trips the real payload.
- **Failed camera capture no longer masquerades as a menu photo.** A real `takePhoto()`
  failure previously fell through to a placeholder image that was uploaded as if it were
  the user's menu; it now surfaces an error. The shutter is also guarded against
  overlapping captures (double-tap → "already capturing").
- **Paywall stray-timer bug.** The post-purchase auto-close `setTimeout` is now tracked
  and cleared on unmount, so dismissing the sheet manually can't fire a second navigation
  that pops the wrong screen.

[0.1.2]: https://github.com/veter391/bocado/releases/tag/v0.1.2

## [0.1.1] — 2026-07-11

### Performance
- Keep the perception system prompt fully static so WaveSpeed's prompt cache reuses it in
  full across every scan and display language. The display locale moved from the middle of
  the system prompt into the variable user turn, so the large canonical-vocabulary block now
  always sits inside the shared cache prefix. Behaviour is unchanged; only the cache prefix
  widens.

### Security
- Close cost-amplification gaps on the public model endpoints: the `/scan` rate limiter is
  always keyed (opaque device id, else hashed client IP) so omitting a header no longer
  bypasses it; default `SCAN_RATE_LIMIT` / `IMAGE_RATE_LIMIT` ship in config so a fresh
  deploy is capped out of the box; and each uploaded image has an explicit size cap.

### Added
- Continuous integration (GitHub Actions): typecheck + unit tests on every push and pull
  request; Dependabot for npm and GitHub Actions updates.

### Changed
- Public repository hygiene: reference docs moved under `docs/`, internal-only material kept
  out of the public tree, throwaway test artifacts removed, and a public-facing README with a
  banner and a permanent download QR.

[Unreleased]: https://github.com/veter391/bocado/compare/v0.1.4...HEAD
[0.1.1]: https://github.com/veter391/bocado/releases/tag/v0.1.1
