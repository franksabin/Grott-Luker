-- Know Your Numbers client submissions.
--
-- Apply locally:   npx wrangler d1 execute grott-luker-snapshots --local  --file=./schema.sql
-- Apply remotely:  npx wrangler d1 execute grott-luker-snapshots --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS snapshots (
  id                 TEXT PRIMARY KEY,
  created_at         TEXT NOT NULL,
  name               TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT,
  notes              TEXT,
  -- Full set of entered figures, stored as a JSON object of numbers.
  figures            TEXT NOT NULL,
  -- Denormalized summary values so the list view needs no parsing.
  net_worth          REAL,
  total_assets       REAL,
  total_liabilities  REAL,
  annual_cash_flow   REAL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_created_at
  ON snapshots (created_at DESC);
