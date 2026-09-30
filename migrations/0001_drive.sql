-- Credentials are encrypted in the application; notebook payloads never enter D1.
CREATE TABLE drive_accounts (
  origin TEXT NOT NULL,
  account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  PRIMARY KEY (origin, account_id)
);
CREATE TABLE drive_sessions (
  token_hash TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  account_id TEXT NOT NULL,
  installation TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  touched INTEGER NOT NULL
);
CREATE INDEX drive_sessions_account ON drive_sessions(origin, account_id);
CREATE TABLE drive_flows (
  state_hash TEXT PRIMARY KEY,
  claim_hash TEXT NOT NULL,
  origin TEXT NOT NULL,
  installation TEXT NOT NULL,
  device_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  browser_hash TEXT,
  account_id TEXT,
  error TEXT,
  expires INTEGER NOT NULL
);
CREATE TABLE drive_uploads (
  origin TEXT NOT NULL,
  account_id TEXT NOT NULL,
  installation TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  file_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  PRIMARY KEY (origin, account_id, installation, snapshot)
);
