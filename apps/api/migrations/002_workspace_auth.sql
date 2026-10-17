-- dialect:common
CREATE TABLE workspace_users (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL CHECK (workspace_id = 'synthetic'),
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('viewer', 'analyst', 'reviewer', 'admin')),
 created_at TEXT NOT NULL
);
-- statement
CREATE TABLE workspace_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES workspace_users(id),
 expires_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
-- statement
CREATE INDEX workspace_sessions_expiry_idx ON workspace_sessions(expires_at);
