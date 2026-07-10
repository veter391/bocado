-- Bocado API — USDA FoodData Central runtime-fallback cache (EU jurisdiction).
--
-- Apply locally:   wrangler d1 migrations apply bocado --local
-- Apply remote:    wrangler d1 migrations apply bocado --remote
--
-- ANONYMITY / NO-PII INVARIANT (SECURITY.md §1): this cache holds ONLY generic-food
-- nutrition rows keyed by a normalized food NAME — never user identity, allergies,
-- location, or any GDPR Art. 9 health data. It mirrors the perception cache strategy:
-- a long-tail food the baked-in CIQUAL/USDA table cannot resolve is fetched once from
-- USDA FoodData Central (CC0 1.0 public domain), then reused globally.
--
-- A row with `record IS NULL` is a NEGATIVE cache entry (the food was not resolvable),
-- honoured with a short TTL in code so repeated unknowns do not hammer the API while a
-- genuinely-new food can still be retried later.

CREATE TABLE IF NOT EXISTS usda_food_cache (
  food_key    TEXT PRIMARY KEY,            -- normalizeName(canonicalName)
  record      TEXT,                        -- JSON-serialized FoodRecord (db:'API'); NULL = negative cache
  created_at  TEXT NOT NULL                -- ISO-8601 timestamp (also the negative-cache TTL anchor)
);
