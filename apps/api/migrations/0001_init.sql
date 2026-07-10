-- Bocado API — initial D1 schema (EU jurisdiction).
--
-- Apply locally (against the local .wrangler state used by `wrangler dev`):
--   wrangler d1 migrations apply bocado --local
-- Apply to the remote EU database (after creating it with --location weur):
--   wrangler d1 migrations apply bocado --remote
--
-- ANONYMITY / NO-PII INVARIANT (SECURITY.md §1):
--  - There are NO accounts and NO user identity here. `device_id` is a CLIENT-PROVIDED
--    opaque id (a random installation id), NOT an account and NOT personal identity.
--  - We store the anonymous ScannedMenu the user chose to save, and an anonymous
--    perception cache keyed by a hash of the cleaned image. Neither table holds
--    allergies, location, free-text profile, email, or any GDPR Art. 9 health data —
--    those stay on-device.

-- Anonymous, user-saved scanned menus. `dishes` is the JSON-serialized Dish[] from
-- the engine (nutrition ranges, "may contain" allergen flags, time-based suitability).
CREATE TABLE IF NOT EXISTS saved_menus (
  id          TEXT PRIMARY KEY,            -- ScannedMenu.id (uuid)
  device_id   TEXT NOT NULL,               -- opaque client installation id (NOT identity)
  created_at  TEXT NOT NULL,               -- ISO-8601 timestamp
  context     TEXT NOT NULL,               -- MealContext (breakfast|lunch|dinner|late-night|snack)
  title       TEXT,                        -- optional menu/restaurant title
  dishes      TEXT NOT NULL                -- JSON-serialized Dish[]
);

-- Recent-menus list for a device is ordered by recency; index that access path.
CREATE INDEX IF NOT EXISTS idx_saved_menus_device_created
  ON saved_menus (device_id, created_at DESC);

-- Anonymous perception cache: a stable hash of the cleaned image -> the perceived
-- menu JSON the model returned. Lets repeat scans of the same photo skip the model
-- call entirely. Holds no user data — only image-derived content.
CREATE TABLE IF NOT EXISTS perception_cache (
  image_hash  TEXT PRIMARY KEY,            -- stable hex hash of the cleaned image bytes
  perceived   TEXT NOT NULL,               -- JSON-serialized PerceivedMenu
  created_at  TEXT NOT NULL                -- ISO-8601 timestamp
);
