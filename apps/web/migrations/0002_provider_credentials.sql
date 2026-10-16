CREATE TABLE provider_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cli_auth_sessions (
  device_code TEXT PRIMARY KEY NOT NULL,
  user_code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  cli_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE cli_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  program TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  metrics_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX activity_logs_user_id_idx ON activity_logs (user_id, activity_date DESC);

CREATE TABLE email_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  url TEXT,
  otp TEXT,
  created_at INTEGER NOT NULL
);
