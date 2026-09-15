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

-- Anonymous tool-open events. No user or client data — just which tool, when.
-- Used to inform the roadmap; nothing is displayed in the app.
CREATE TABLE IF NOT EXISTS usage_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id  TEXT NOT NULL,
  ts       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_events_tool_ts ON usage_events (tool_id, ts DESC);

-- Mileage & Expense Log client submissions.
CREATE TABLE IF NOT EXISTS mileage_logs (
  id                   TEXT PRIMARY KEY,
  created_at           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  notes                TEXT,
  tax_year             INTEGER NOT NULL,
  -- Full log { taxYear, trips[], expenses[] } as JSON.
  log                  TEXT NOT NULL,
  total_miles          REAL,
  estimated_deduction  REAL
);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_created_at ON mileage_logs (created_at DESC);

-- Charitable Donation Log client submissions.
CREATE TABLE IF NOT EXISTS donation_logs (
  id                   TEXT PRIMARY KEY,
  created_at           TEXT NOT NULL,
  name                 TEXT NOT NULL,
  email                TEXT NOT NULL,
  phone                TEXT,
  notes                TEXT,
  tax_year             INTEGER NOT NULL,
  log                  TEXT NOT NULL,
  total_gifts          REAL,
  estimated_deduction  REAL
);
CREATE INDEX IF NOT EXISTS idx_donation_logs_created_at ON donation_logs (created_at DESC);
