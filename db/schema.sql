-- FitBuilder schema for Railway Postgres (or any Postgres 14+).
--
-- Applied automatically at API boot by apps/api/src/db/migrate.ts, which runs
-- this file inside a transaction. Every statement must therefore be idempotent.
-- To apply by hand:  psql "$DATABASE_URL" -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lowercased; the unique index below is what actually enforces it.
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  tier            TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  -- Set when a Pro subscription lapses; NULL for free accounts.
  tier_expires_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft delete first so a mistaken deletion is recoverable inside the grace
  -- window; a scheduled purge removes the row and its data afterwards.
  deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (LOWER(email)) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Sessions
--
-- Access tokens are short-lived JWTs verified in-process. Refresh tokens live
-- here so a session can actually be revoked: sign-out, password change and
-- account deletion all delete rows, which no stateless scheme can do.
-- Only the hash is stored, so a database leak does not yield usable tokens.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Set when the token is rotated or revoked; kept briefly to detect reuse.
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_expiry_idx ON refresh_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- One-time tokens for email verification and password reset.
-- Same table, separated by purpose, since the lifecycle is identical.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS auth_tokens_expiry_idx ON auth_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- Application data
--
-- Payloads are stored as JSONB so the client's record shape can evolve without
-- a migration per field. user_id is NOT NULL and every query filters on it —
-- with no row-level security in play, the API is the only thing standing
-- between accounts, so scoping is enforced in every statement.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS fits (
  id         TEXT NOT NULL,
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payload    JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS wardrobe_items_sync_idx ON wardrobe_items (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS fits_sync_idx ON fits (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Metered usage, per account per calendar month.
-- Mirrors the file-backed store so a multi-instance deploy shares one ceiling.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  period      TEXT NOT NULL,           -- 'YYYY-MM'
  action      TEXT NOT NULL CHECK (action IN ('garments', 'tryons', 'styleframes', 'stylist')),
  count       INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, period, action)
);
