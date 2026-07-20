# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/veter391/bocado/compare/v0.1.2...HEAD
[0.1.1]: https://github.com/veter391/bocado/releases/tag/v0.1.1
