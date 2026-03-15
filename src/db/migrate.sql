-- Run this in your Neon database to create tables

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  vault_public_key TEXT NOT NULL,
  vault_keypair_encrypted TEXT NOT NULL,
  eligibility_type TEXT NOT NULL CHECK (eligibility_type IN ('percent', 'amount')),
  eligibility_value TEXT NOT NULL,
  base_interval_ms BIGINT NOT NULL,
  increment_ms BIGINT NOT NULL DEFAULT 0,
  cap_ms BIGINT NOT NULL,
  draw_count INTEGER NOT NULL DEFAULT 0,
  next_draw_at TIMESTAMPTZ NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  creator_wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draws (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  draw_number INTEGER NOT NULL,
  winner_wallet TEXT,
  prize_amount_lamports BIGINT,
  prize_tx_signature TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  rolled_over BOOLEAN NOT NULL DEFAULT FALSE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  draw_number INTEGER NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  holders JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active, next_draw_at);
CREATE INDEX IF NOT EXISTS idx_draws_project ON draws(project_id, draw_number);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_draw ON snapshots(project_id, draw_number);
