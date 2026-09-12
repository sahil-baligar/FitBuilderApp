-- FitBuilder cloud schema for Railway Postgres (or any Postgres 14+).
-- Apply once:  psql "$DATABASE_URL" -f db/schema.sql
-- Tables match packages/core sync.ts names so clients can sync wardrobe + fits.

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS fits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS wardrobe_items_user_idx ON wardrobe_items (user_id);
CREATE INDEX IF NOT EXISTS fits_user_idx ON fits (user_id);
CREATE INDEX IF NOT EXISTS wardrobe_items_updated_idx ON wardrobe_items (updated_at DESC);
CREATE INDEX IF NOT EXISTS fits_updated_idx ON fits (updated_at DESC);
